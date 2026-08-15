import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Phone, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, MessageSquare, CheckCircle2 } from 'lucide-react';
import { validateUserPassword } from '@/lib/passwordPolicy';
import MobileHeader from '@/components/mobile/MobileHeader';

// 密码强度
function getStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 1) return { score: s, label: '弱', color: 'bg-destructive' };
  if (s <= 3) return { score: s, label: '中', color: 'bg-warning' };
  return { score: s, label: '强', color: 'bg-success' };
}

// 步骤指示器
function StepDot({ n, current, label }: { n: number; current: number; label: string }) {
  const done = current > n;
  const active = current === n;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
        done ? 'bg-primary border-primary text-primary-foreground' :
        active ? 'bg-primary/10 border-primary text-primary' :
        'bg-muted border-border text-muted-foreground'
      }`}>
        {done ? <CheckCircle2 size={14} /> : n}
      </div>
      <span className={`text-[10px] ${active || done ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}

const RESEND_SECONDS = 60;

export default function MForgotPasswordPage() {
  const navigate = useNavigate();

  // 步骤: 1=填手机+发验证码, 2=输验证码, 3=设新密码, 4=完成
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  // Step 2
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = getStrength(newPwd);

  // 倒计时
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCountdown() {
    setCountdown(RESEND_SECONDS);
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  // Step 1 → 发送 OTP
  const handleSendOtp = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入正确的手机号'); return; }

    // 先确认该手机号在系统中已注册
    const { data: exist } = await supabase
      .from('users').select('id').eq('phone', phone).maybeSingle();
    if (!exist) { toast.error('该手机号未注册'); return; }

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: '+86' + phone });
    setSending(false);

    if (error) { toast.error('验证码发送失败：' + error.message); return; }
    toast.success('验证码已发送，请查看短信');
    startCountdown();
    setStep(2);
  };

  // Step 2 → 验证 OTP
  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) { toast.error('请输入收到的验证码'); return; }
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: '+86' + phone,
      token: otp,
      type: 'sms',
    });
    setVerifying(false);
    if (error) { toast.error('验证码错误或已过期，请重试'); return; }
    // 验证通过后立即退出 Supabase Auth 会话（移动端用自有登录体系）
    await supabase.auth.signOut();
    setStep(3);
  };

  // Step 3 → 保存新密码
  const handleSavePwd = async () => {
    const pwdErr = validateUserPassword(newPwd);
    if (pwdErr) { toast.error(pwdErr); return; }
    if (newPwd !== confirmPwd) { toast.error('两次密码不一致'); return; }
    setSaving(true);
    const { error } = await supabase.from('users').update({ password: newPwd }).eq('phone', phone);
    setSaving(false);
    if (error) { toast.error('密码重置失败，请重试'); return; }
    toast.success('密码已重置');
    setStep(4);
    setTimeout(() => navigate('/m/login'), 2000);
  };

  // 重新发送
  const handleResend = async () => {
    if (countdown > 0) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: '+86' + phone });
    setSending(false);
    if (error) { toast.error('重新发送失败：' + error.message); return; }
    toast.success('验证码已重新发送');
    startCountdown();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MobileHeader title="忘记密码" back="/m/login" />
      {/* 顶部 */}
      <div className="flex flex-col items-center pt-12 pb-6 px-6">
        <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center mb-4">
          <ShieldCheck size={28} className="text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">忘记密码</h1>
        <p className="text-sm text-muted-foreground mt-1 text-center">通过手机验证码重置登录密码</p>
      </div>

      {/* 步骤条 */}
      {step < 4 && (
        <div className="flex items-center justify-center gap-0 px-10 mb-6">
          <StepDot n={1} current={step} label="验证手机" />
          <div className={`flex-1 h-px mx-1 transition-colors ${step > 1 ? 'bg-primary' : 'bg-border'}`} />
          <StepDot n={2} current={step} label="输入验证码" />
          <div className={`flex-1 h-px mx-1 transition-colors ${step > 2 ? 'bg-primary' : 'bg-border'}`} />
          <StepDot n={3} current={step} label="设置新密码" />
        </div>
      )}

      {/* 表单区 */}
      <div className="flex-1 px-6">

        {/* ── Step 1: 手机号 ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">注册手机号</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="请输入注册手机号"
                  className="pl-9 h-12 text-base"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  maxLength={11}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                />
              </div>
            </div>
            <Button className="w-full h-12 text-base font-medium" onClick={handleSendOtp} disabled={sending}>
              <MessageSquare size={15} className="mr-2" />
              {sending ? '发送中...' : '获取验证码'}
            </Button>
          </div>
        )}

        {/* ── Step 2: 验证码 ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs text-muted-foreground text-center">
              验证码已发送至 <span className="font-mono font-medium text-foreground">+86 {phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">短信验证码</label>
              <Input
                type="number"
                placeholder="请输入6位验证码"
                className="h-12 text-xl text-center font-bold tracking-widest"
                value={otp}
                onChange={e => setOtp(e.target.value.slice(0, 6))}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
              />
            </div>
            <Button className="w-full h-12 text-base font-medium" onClick={handleVerifyOtp} disabled={verifying}>
              {verifying ? '验证中...' : '验证'}
              {!verifying && <ArrowRight size={15} className="ml-1" />}
            </Button>

            {/* 重新发送 */}
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setStep(1)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                ← 修改手机号
              </button>
              <button
                onClick={handleResend}
                disabled={countdown > 0 || sending}
                className={`transition-colors ${countdown > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:text-primary/80'}`}
              >
                {countdown > 0 ? `重新发送 (${countdown}s)` : sending ? '发送中...' : '重新发送'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 新密码 ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">新密码（至少 6 位）</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showNew ? 'text' : 'password'}
                  placeholder="请设置新密码"
                  className="pl-9 pr-10 h-12 text-base"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowNew(v => !v)}>
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {newPwd && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${i <= strength.score ? strength.color : 'bg-muted'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground w-4">{strength.label}</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">确认新密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="请再次输入新密码"
                  className="pl-9 pr-10 h-12 text-base"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSavePwd()}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPwd && newPwd !== confirmPwd && (
                <p className="text-xs text-destructive mt-1">两次密码不一致</p>
              )}
            </div>
            <Button className="w-full h-12 text-base font-medium" onClick={handleSavePwd} disabled={saving}>
              {saving ? '保存中...' : '确认重置密码'}
              {!saving && <ArrowRight size={15} className="ml-1" />}
            </Button>
          </div>
        )}

        {/* ── Step 4: 完成 ── */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-4 pt-8">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 size={36} className="text-success" />
            </div>
            <p className="text-base font-semibold text-foreground">密码重置成功</p>
            <p className="text-sm text-muted-foreground">正在跳转到登录页面...</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mt-8 text-sm">
          <span className="text-muted-foreground">想起密码了？</span>
          <Link to="/m/login" className="text-primary font-medium">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
