import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';

export interface MobileUser {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
  real_name: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | 'unsubmitted';
  member_level: 'normal' | 'member' | 'captain';
  merchant_type: 'trial' | 'regular';
  consecutive_missed: number;
  invite_code: string;
  referrer_id: string | null;
  is_banned: boolean;
  is_super_admin: boolean;
  exit_request_at: string | null;
}

interface MobileUserContextValue {
  mobileUser: MobileUser | null;
  sessionToken: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ error: string | null }>;
  register: (phone: string, password: string, inviteCode?: string) => Promise<{ error: string | null }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// 提供非空默认值，避免 HMR 热重载时新旧 Context 引用不一致导致 useContext 返回 null 报错
const defaultContextValue: MobileUserContextValue = {
  mobileUser: null,
  sessionToken: null,
  loading: true,
  login: async () => ({ error: null }),
  register: async () => ({ error: null }),
  logout: () => {},
  refreshUser: async () => {},
};

const MobileUserContext = createContext<MobileUserContextValue>(defaultContextValue);

const SESSION_KEY = 'xmall_mobile_token';

export function MobileUserProvider({ children }: { children: React.ReactNode }) {
  const [mobileUser, setMobileUser] = useState<MobileUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const SELECT_FIELDS = 'id,phone,nickname,real_name,avatar_url,kyc_status,member_level,merchant_type,invite_code,referrer_id,is_banned,is_super_admin,exit_request_at';

  const loadUserByToken = useCallback(async (token: string) => {
    const { data: session } = await supabase
      .from('mobile_sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      setMobileUser(null);
      setSessionToken(null);
      return;
    }
    const { data: user } = await supabase
      .from('users')
      .select(SELECT_FIELDS)
      .eq('id', session.user_id)
      .maybeSingle();
    if (user) {
      setMobileUser(user as MobileUser);
      setSessionToken(token);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
      loadUserByToken(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadUserByToken]);

  // 跨 Context / 跨标签页登录状态同步：
  // 任一侧 login/logout/register 后会派发 'mobile-auth-change' 事件，另一侧据此重载状态
  useEffect(() => {
    const syncHandler = () => {
      const token = localStorage.getItem(SESSION_KEY);
      if (token) {
        loadUserByToken(token);
      } else {
        setMobileUser(null);
        setSessionToken(null);
      }
    };
    window.addEventListener('mobile-auth-change', syncHandler);
    window.addEventListener('storage', syncHandler);
    return () => {
      window.removeEventListener('mobile-auth-change', syncHandler);
      window.removeEventListener('storage', syncHandler);
    };
  }, [loadUserByToken]);

  // 登录：通过手机号+密码验证
  const login = useCallback(async (phone: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select(SELECT_FIELDS + ',password')
        .eq('phone', phone)
        .maybeSingle() as { data: (MobileUser & { password: string }) | null };
      if (!user) return { error: '该手机号未注册' };
      if (user.is_banned) return { error: '账号已被封禁，请联系客服' };
      if (user.password !== password) return { error: '密码错误，请重新输入' };
      // 清理该用户旧的会话，避免 token 堆积（静默失败不影响登录）
      await supabase.from('mobile_sessions').delete().eq('user_id', user.id);
      const { data: sess } = await supabase
        .from('mobile_sessions')
        .insert({ user_id: user.id })
        .select('token')
        .single();
      if (!sess) return { error: '登录失败，请重试' };
      localStorage.setItem(SESSION_KEY, sess.token);
      // 仅存非敏感字段，避免 password 泄漏到 context
      const { password: _pw, ...safeUser } = user;
      setMobileUser(safeUser as MobileUser);
      setSessionToken(sess.token);
      window.dispatchEvent(new Event('mobile-auth-change'));
      return { error: null };
    } catch {
      return { error: '网络异常，请稍后重试' };
    }
  }, []);

  // 注册：新建用户（含密码）
  const register = useCallback(async (phone: string, password: string, inviteCode?: string): Promise<{ error: string | null }> => {
    try {
      // 检查是否已注册
      const { data: exist } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (exist) return { error: '该手机号已注册，请直接登录' };
      // 查找推荐人
      let referrerId: string | null = null;
      if (inviteCode) {
        const { data: referrer } = await supabase
          .from('users')
          .select('id')
          .eq('invite_code', inviteCode.toUpperCase())
          .maybeSingle();
        if (!referrer) return { error: '邀请码无效或不存在' };
        referrerId = referrer.id;
      }
      // 创建用户
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({ phone, password, nickname: `用户${phone.slice(-4)}`, referrer_id: referrerId })
        .select(SELECT_FIELDS)
        .single();
      if (insertErr || !newUser) return { error: '注册失败，请重试' };
      // 建立分销关系
      if (referrerId) {
        const { data: parentRel } = await supabase
          .from('distribution_relations')
          .select('level, path')
          .eq('user_id', referrerId)
          .maybeSingle();
        const level = (parentRel?.level ?? 0) + 1;
        const path = parentRel ? `${parentRel.path}/${referrerId}` : `/${referrerId}`;
        await supabase.from('distribution_relations').insert({
          user_id: newUser.id, parent_id: referrerId, level, path,
        });
      }
      // 创建 session
      const { data: sess } = await supabase
        .from('mobile_sessions')
        .insert({ user_id: newUser.id })
        .select('token')
        .single();
      if (!sess) return { error: '注册成功但登录失败，请手动登录' };
      localStorage.setItem(SESSION_KEY, sess.token);
      setMobileUser(newUser as MobileUser);
      setSessionToken(sess.token);
      window.dispatchEvent(new Event('mobile-auth-change'));
      return { error: null };
    } catch {
      return { error: '网络异常，请稍后重试' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setMobileUser(null);
    setSessionToken(null);
    window.dispatchEvent(new Event('mobile-auth-change'));
  }, []);

  const refreshUser = useCallback(async () => {
    setMobileUser(prev => {
      if (!prev) return prev;
      // 异步刷新用户数据
      supabase
        .from('users')
        .select(SELECT_FIELDS)
        .eq('id', prev.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setMobileUser(data as MobileUser);
        });
      return prev;
    });
  }, []);

  return (
    <MobileUserContext.Provider value={{ mobileUser, sessionToken, loading, login, register, logout, refreshUser }}>
      {children}
    </MobileUserContext.Provider>
  );
}

export function useMobileUser() {
  return useContext(MobileUserContext);
}
