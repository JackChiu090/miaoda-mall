// 会员注册页 /member/register — 真实姓名 + 邀请码必填 + 精美设计
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useMember } from '@/contexts/MemberContext';

interface RegisterForm {
  realName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
}

const STEPS = ['填写资料', '实名认证', '完成签约'];

export default function MemberRegisterPage() {
  const navigate = useNavigate();
  const { register } = useMember();
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RegisterForm>({
    defaultValues: { realName: '', phone: '', password: '', confirmPassword: '', inviteCode: '' },
  });

  const onSubmit = async (values: RegisterForm) => {
    if (values.password !== values.confirmPassword) {
      form.setError('confirmPassword', { message: '两次输入的密码不一致' });
      return;
    }
    setSubmitting(true);
    const { error } = await register(
      values.realName.trim(),
      values.phone.trim(),
      values.password,
      values.inviteCode.trim(),
    );
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('注册成功！请完成实名认证');
    navigate('/m/auth');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #b91316 0%, #7f0e10 100%)' }}>
      {/* 顶部品牌区 */}
      <div className="flex flex-col items-center pt-10 pb-6 px-4">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-3 shadow-lg backdrop-blur-sm">
          <span className="text-white font-bold text-xl">ZTC</span>
        </div>
        <h1 className="text-white text-2xl font-bold tracking-wide">众泰成商城</h1>
        <p className="text-white/70 text-sm mt-1">会员注册</p>
      </div>

      {/* 步骤条 */}
      <div className="flex items-center justify-center gap-0 px-8 mb-6">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${i === 0 ? 'bg-white text-[#b91316] border-white' : 'bg-white/20 text-white/60 border-white/30'}`}>
                {i === 0 ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={`text-xs mt-1 ${i === 0 ? 'text-white font-medium' : 'text-white/50'}`}>{step}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-12 h-px bg-white/30 mx-1 mb-4" />
            )}
          </div>
        ))}
      </div>

      {/* 表单卡片 */}
      <div className="flex-1 bg-background rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl">
        <h2 className="text-xl font-bold text-foreground mb-1">填写注册信息</h2>
        <p className="text-sm text-muted-foreground mb-6">请使用真实信息，用于实名认证</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* 真实姓名 */}
            <FormField
              control={form.control}
              name="realName"
              rules={{ required: '请输入真实姓名', minLength: { value: 2, message: '姓名至少 2 个字' } }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    真实姓名 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请输入您的真实姓名"
                      className="h-12 bg-muted/40 border-border focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 邀请码 */}
            <FormField
              control={form.control}
              name="inviteCode"
              rules={{ required: '邀请码为必填项，请向邀请人索取' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    邀请码 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请输入邀请码（向邀请人索取）"
                      className="h-12 bg-muted/40 border-border focus:border-primary uppercase"
                      maxLength={8}
                      {...field}
                      onChange={e => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 手机号 */}
            <FormField
              control={form.control}
              name="phone"
              rules={{
                required: '请输入手机号',
                pattern: { value: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    手机号 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="请输入手机号"
                      className="h-12 bg-muted/40 border-border focus:border-primary"
                      maxLength={11}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 密码 */}
            <FormField
              control={form.control}
              name="password"
              rules={{ required: '请输入密码', minLength: { value: 6, message: '密码至少 6 位' } }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    登录密码 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="请设置登录密码（至少6位）"
                        className="h-12 bg-muted/40 border-border focus:border-primary pr-12"
                        {...field}
                      />
                      <button type="button" onClick={() => setShowPwd(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 确认密码 */}
            <FormField
              control={form.control}
              name="confirmPassword"
              rules={{ required: '请确认密码' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    确认密码 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="再次输入密码"
                        className="h-12 bg-muted/40 border-border focus:border-primary pr-12"
                        {...field}
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 text-base font-semibold gap-2"
                style={{ background: 'linear-gradient(90deg, #b91316, #dc143c)', border: 'none' }}
              >
                {submitting ? '注册中...' : (<>下一步：实名认证 <ArrowRight size={16} /></>)}
              </Button>
            </div>
          </form>
        </Form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link to="/member/login" className="text-primary font-medium hover:underline">立即登录</Link>
        </div>
      </div>
    </div>
  );
}
