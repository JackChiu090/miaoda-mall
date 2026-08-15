import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, ShieldCheck, AlertTriangle, Phone, KeyRound } from 'lucide-react';
import { validateUserPassword } from '@/lib/passwordPolicy';

// 密码强度评估
function getPasswordStrength(pwd: string): { score: number; label: string } {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 6)  score += 25;
  if (pwd.length >= 8)  score += 15;
  if (/[A-Z]/.test(pwd)) score += 20;
  if (/[0-9]/.test(pwd)) score += 20;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 20;
  if (score <= 25) return { score, label: '弱' };
  if (score <= 55) return { score, label: '中' };
  return { score, label: '强' };
}

type Tab = 'change' | 'reset';

export default function MSecurityPage() {
  const { mobileUser, refreshUser } = useMobileUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('change');

  // ── 修改密码状态 ──
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showOld, setShowOld]         = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging]       = useState(false);

  // ── 手机号找回密码状态 ──
  const [resetPhone, setResetPhone]   = useState('');
  const [resetNewPwd, setResetNewPwd] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetNew, setShowResetNew]     = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting]     = useState(false);

  const strength    = getPasswordStrength(newPwd);
  const resetStrength = getPasswordStrength(resetNewPwd);

  // ── 修改密码（已登录，需验证原密码）──
  const handleChange = async () => {
    if (!mobileUser) { navigate('/m/login'); return; }
    if (!oldPwd)                         { toast.error('请输入原密码'); return; }
    const pwdErr = validateUserPassword(newPwd);
    if (pwdErr)                          { toast.error(pwdErr); return; }
    if (newPwd === oldPwd)               { toast.error('新密码不能与原密码相同'); return; }
    if (newPwd !== confirmPwd)           { toast.error('两次密码不一致'); return; }

    setChanging(true);
    try {
      const { data: row } = await supabase.from('users').select('password').eq('id', mobileUser.id).maybeSingle();
      if (!row) { toast.error('验证失败，请重试'); return; }
      if (row.password !== oldPwd) { toast.error('原密码错误'); return; }
      const { error } = await supabase.from('users').update({ password: newPwd }).eq('id', mobileUser.id);
      if (error) { toast.error('修改失败，请稍后重试'); return; }
      await refreshUser();
      toast.success('密码修改成功');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      setTimeout(() => navigate('/m/member'), 1200);
    } finally {
      setChanging(false);
    }
  };

  // ── 手机号找回密码（无需登录）──
  const handleReset = async () => {
    if (!/^1[3-9]\d{9}$/.test(resetPhone)) { toast.error('请输入正确的手机号'); return; }
    const pwdErr = validateUserPassword(resetNewPwd);
    if (pwdErr) { toast.error(pwdErr); return; }
    if (resetNewPwd !== resetConfirm)       { toast.error('两次密码不一致'); return; }

    setResetting(true);
    try {
      // 验证手机号是否已注册
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('phone', resetPhone)
        .maybeSingle();
      if (!user) { toast.error('该手机号未注册'); return; }

      const { error } = await supabase
        .from('users')
        .update({ password: resetNewPwd })
        .eq('phone', resetPhone);
      if (error) { toast.error('重置失败，请稍后重试'); return; }

      toast.success('密码已重置，请重新登录');
      setResetPhone(''); setResetNewPwd(''); setResetConfirm('');
      setTimeout(() => navigate('/m/login'), 1400);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="安全管理" back />

      <div className="px-4 py-5 space-y-4">

        {/* Tab 切换 */}
        <div className="flex bg-muted/50 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('change')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'change' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock size={14} />
            修改密码
          </button>
          <button
            onClick={() => setTab('reset')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'reset' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Phone size={14} />
            忘记密码
          </button>
        </div>

        {/* ── Tab: 修改密码 ── */}
        {tab === 'change' && (
          <>
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <ShieldCheck size={17} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">修改成功后即刻生效，建议使用字母+数字+符号组合</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">修改登录密码</h2>
              </div>

              {/* 原密码 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">原密码 *</label>
                <div className="relative">
                  <Input type={showOld ? 'text' : 'password'} placeholder="请输入原密码"
                    className="h-11 pr-10" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
                  <button type="button" onClick={() => setShowOld(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 新密码 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">新密码 * <span className="text-muted-foreground/60">（至少6位）</span></label>
                <div className="relative">
                  <Input type={showNew ? 'text' : 'password'} placeholder="请设置新密码"
                    className="h-11 pr-10" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPwd && (
                  <div className="mt-2 space-y-1">
                    <Progress value={strength.score} className="h-1.5 bg-muted" />
                    <p className="text-xs text-muted-foreground">密码强度：<span className={
                      strength.label === '强' ? 'text-success font-medium' :
                      strength.label === '中' ? 'text-warning font-medium' : 'text-destructive font-medium'
                    }>{strength.label}</span></p>
                  </div>
                )}
              </div>

              {/* 确认新密码 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">确认新密码 *</label>
                <div className="relative">
                  <Input type={showConfirm ? 'text' : 'password'} placeholder="再次输入新密码"
                    className={`h-11 pr-10 ${confirmPwd && confirmPwd !== newPwd ? 'border-destructive' : ''}`}
                    value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPwd && confirmPwd !== newPwd && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} />两次密码不一致
                  </p>
                )}
              </div>
            </div>

            <Button className="w-full h-12 text-base" onClick={handleChange} disabled={changing}>
              {changing ? '修改中...' : '确认修改密码'}
            </Button>
          </>
        )}

        {/* ── Tab: 手机号找回密码 ── */}
        {tab === 'reset' && (
          <>
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <Phone size={17} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">通过注册手机号验证身份，直接重置登录密码</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">手机号找回密码</h2>
              </div>

              {/* 手机号 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">注册手机号 *</label>
                <Input type="tel" placeholder="请输入注册时的手机号"
                  className="h-11" value={resetPhone}
                  onChange={e => setResetPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
              </div>

              {/* 新密码 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">新密码 * <span className="text-muted-foreground/60">（至少6位）</span></label>
                <div className="relative">
                  <Input type={showResetNew ? 'text' : 'password'} placeholder="请设置新密码"
                    className="h-11 pr-10" value={resetNewPwd} onChange={e => setResetNewPwd(e.target.value)} />
                  <button type="button" onClick={() => setShowResetNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showResetNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {resetNewPwd && (
                  <div className="mt-2 space-y-1">
                    <Progress value={resetStrength.score} className="h-1.5 bg-muted" />
                    <p className="text-xs text-muted-foreground">密码强度：<span className={
                      resetStrength.label === '强' ? 'text-success font-medium' :
                      resetStrength.label === '中' ? 'text-warning font-medium' : 'text-destructive font-medium'
                    }>{resetStrength.label}</span></p>
                  </div>
                )}
              </div>

              {/* 确认新密码 */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">确认新密码 *</label>
                <div className="relative">
                  <Input type={showResetConfirm ? 'text' : 'password'} placeholder="再次输入新密码"
                    className={`h-11 pr-10 ${resetConfirm && resetConfirm !== resetNewPwd ? 'border-destructive' : ''}`}
                    value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} />
                  <button type="button" onClick={() => setShowResetConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showResetConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {resetConfirm && resetConfirm !== resetNewPwd && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} />两次密码不一致
                  </p>
                )}
              </div>
            </div>

            <Button className="w-full h-12 text-base" onClick={handleReset} disabled={resetting}>
              {resetting ? '重置中...' : '重置密码'}
            </Button>
          </>
        )}

        {/* 安全建议 */}
        <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">安全建议</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>密码长度建议 8 位以上</li>
            <li>使用字母、数字、符号混合组合</li>
            <li>不要使用手机号、生日等易猜密码</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
