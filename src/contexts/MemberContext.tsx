// 会员系统 Auth 状态管理（独立于移动端 MobileUserContext）
// 复用 users + mobile_sessions 表，路由/存储 key 完全独立
import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';

export interface Member {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | 'unsubmitted';
  member_level: 'normal' | 'member' | 'captain';
  merchant_type: 'trial' | 'regular';
  is_banned: boolean;
  created_at: string;
}

interface MemberContextValue {
  member: Member | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ error: string | null }>;
  register: (nickname: string, phone: string, password: string, inviteCode: string) => Promise<{ error: string | null }>;
  logout: () => void;
  refreshMember: () => Promise<void>;
  updateProfile: (fields: Partial<Pick<Member, 'nickname' | 'avatar_url'>>) => Promise<{ error: string | null }>;
  changePassword: (oldPwd: string, newPwd: string) => Promise<{ error: string | null }>;
}

const defaultValue: MemberContextValue = {
  member: null,
  loading: true,
  login: async () => ({ error: null }),
  register: async () => ({ error: null }),  logout: () => {},
  refreshMember: async () => {},
  updateProfile: async () => ({ error: null }),
  changePassword: async () => ({ error: null }),
};

const MemberContext = createContext<MemberContextValue>(defaultValue);

// 与 MobileUserContext 共用同一个 token 存储 key，确保任一入口登录后两边状态一致
const SESSION_KEY = 'xmall_mobile_token';

const SELECT_FIELDS =
  'id,phone,nickname,avatar_url,kyc_status,member_level,merchant_type,is_banned,created_at';

export function MemberProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const loadByToken = useCallback(async (token: string) => {
    const { data: session } = await supabase
      .from('mobile_sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      setMember(null);
      return;
    }
    const { data: user } = await supabase
      .from('users')
      .select(SELECT_FIELDS)
      .eq('id', session.user_id)
      .maybeSingle();
    if (user) setMember(user as Member);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
      loadByToken(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadByToken]);

  // 跨 Context / 跨标签页登录状态同步
  useEffect(() => {
    const syncHandler = () => {
      const token = localStorage.getItem(SESSION_KEY);
      if (token) {
        loadByToken(token);
      } else {
        setMember(null);
      }
    };
    window.addEventListener('mobile-auth-change', syncHandler);
    window.addEventListener('storage', syncHandler);
    return () => {
      window.removeEventListener('mobile-auth-change', syncHandler);
      window.removeEventListener('storage', syncHandler);
    };
  }, [loadByToken]);

  const login = useCallback(async (phone: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select(SELECT_FIELDS + ',password')
        .eq('phone', phone)
        .maybeSingle() as { data: (Member & { password: string }) | null };
      if (!user) return { error: '该手机号未注册' };
      if (user.is_banned) return { error: '账号已被封禁，请联系客服' };
      if (user.password !== password) return { error: '密码错误，请重新输入' };
      // 清理旧会话，避免 token 堆积
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
      setMember(safeUser as Member);
      window.dispatchEvent(new Event('mobile-auth-change'));
      return { error: null };
    } catch {
      return { error: '网络异常，请稍后重试' };
    }
  }, []);

  const register = useCallback(async (
    nickname: string,
    phone: string,
    password: string,
    inviteCode: string,
  ): Promise<{ error: string | null }> => {
    try {
      const { data: exist } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (exist) return { error: '该手机号已注册，请直接登录' };
      // 验证邀请码
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('invite_code', inviteCode.toUpperCase())
        .maybeSingle();
      if (!referrer) return { error: '邀请码无效或不存在，请确认后重新输入' };
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({ phone, password, nickname, referrer_id: referrer.id })
        .select(SELECT_FIELDS)
        .single();
      if (insertErr || !newUser) return { error: '注册失败：' + (insertErr?.message ?? '未知错误') };
      // 建立分销关系
      const { data: parentRel } = await supabase
        .from('distribution_relations')
        .select('level, path')
        .eq('user_id', referrer.id)
        .maybeSingle();
      const level = (parentRel?.level ?? 0) + 1;
      const path = parentRel ? `${parentRel.path}/${referrer.id}` : `/${referrer.id}`;
      await supabase.from('distribution_relations').insert({
        user_id: newUser.id, parent_id: referrer.id, level, path,
      });
      // 注册后自动登录（方便后续跳实名认证）
      const { data: sess } = await supabase
        .from('mobile_sessions')
        .insert({ user_id: newUser.id })
        .select('token')
        .single();
      if (sess) {
        localStorage.setItem(SESSION_KEY, sess.token);
        setMember(newUser as Member);
        window.dispatchEvent(new Event('mobile-auth-change'));
      }
      return { error: null };
    } catch {
      return { error: '网络异常，请稍后重试' };
    }
  }, []);

  const logout = useCallback(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
      supabase.from('mobile_sessions').delete().eq('token', token).then(() => {});
    }
    localStorage.removeItem(SESSION_KEY);
    setMember(null);
    window.dispatchEvent(new Event('mobile-auth-change'));
  }, []);

  const refreshMember = useCallback(async () => {
    setMember(prev => {
      if (!prev) return prev;
      supabase
        .from('users')
        .select(SELECT_FIELDS)
        .eq('id', prev.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setMember(data as Member);
        });
      return prev;
    });
  }, []);

  const updateProfile = async (
    fields: Partial<Pick<Member, 'nickname' | 'avatar_url'>>,
  ): Promise<{ error: string | null }> => {
    if (!member) return { error: '未登录' };
    const { error } = await supabase.from('users').update(fields).eq('id', member.id);
    if (error) return { error: error.message };
    setMember(prev => (prev ? { ...prev, ...fields } : prev));
    return { error: null };
  };

  const changePassword = async (
    oldPwd: string,
    newPwd: string,
  ): Promise<{ error: string | null }> => {
    if (!member) return { error: '未登录' };
    const { data: user } = await supabase
      .from('users')
      .select('password')
      .eq('id', member.id)
      .maybeSingle() as { data: { password: string } | null };
    if (!user) return { error: '用户不存在' };
    if (user.password !== oldPwd) return { error: '原密码错误' };
    const { error } = await supabase.from('users').update({ password: newPwd }).eq('id', member.id);
    if (error) return { error: error.message };
    return { error: null };
  };

  return (
    <MemberContext.Provider
      value={{ member, loading, login, register, logout, refreshMember, updateProfile, changePassword }}
    >
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  return useContext(MemberContext);
}
