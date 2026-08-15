import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { AdminRole } from '@/lib/roles';

export interface AdminProfile {
  id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  adminProfile: AdminProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAdminProfile(userId: string): Promise<AdminProfile | null> {
  const { data } = await supabase
    .from('admin_profiles')
    .select('id, email, display_name, role, is_active')
    .eq('id', userId)
    .maybeSingle();
  return data ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 加载管理员档案。注意：不要在 supabase auth 的 onAuthStateChange 回调里
  // await 任何 supabase 查询 —— 会导致 auth 锁死锁，页面卡在「加载中」。
  const loadProfile = useCallback(async (sess: Session | null) => {
    if (sess?.user) {
      const profile = await fetchAdminProfile(sess.user.id);
      setAdminProfile(profile);
    } else {
      setAdminProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data: { session: sess } }) => {
        if (!mounted) return;
        setSession(sess);
        setLoading(false);
        if (sess?.user) {
          await loadProfile(sess);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      // 关键修复：不在回调里 await supabase 查询（避免 auth 锁死锁）。
      // 用 setTimeout 把档案加载推迟到锁释放之后。
      if (sess?.user) {
        setTimeout(() => {
          if (!mounted) return;
          fetchAdminProfile(sess.user.id)
            .then((p) => {
              if (mounted) setAdminProfile(p);
            })
            .catch(() => {});
        }, 0);
      } else {
        setAdminProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // 登录后检查是否为有效管理员
    const profile = data.user ? await fetchAdminProfile(data.user.id) : null;
    if (!profile) {
      await supabase.auth.signOut();
      return { error: '账号不存在或无管理员权限' };
    }
    if (!profile.is_active) {
      await supabase.auth.signOut();
      return { error: '账号已被禁用，请联系超级管理员' };
    }
    setSession(data.session);
    setAdminProfile(profile);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAdminProfile(null);
  };

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const profile = await fetchAdminProfile(session.user.id);
      setAdminProfile(profile);
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, adminProfile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
