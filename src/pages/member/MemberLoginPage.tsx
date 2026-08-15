// 会员登录页 /member/login — 全屏极简单列设计
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { Eye, EyeOff, Phone, Lock, ArrowRight } from 'lucide-react';
import { useMember } from '@/contexts/MemberContext';

interface LoginForm {
  phone: string;
  password: string;
}




/* 输入框组件：带图标 + focus 下划线动画 */
function AnimatedInput({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  onBlur,
  maxLength,
  suffix,
  autoComplete,
  name,
}: {
  icon: React.ElementType;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  maxLength?: number;
  suffix?: React.ReactNode;
  autoComplete?: string;
  name?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative group">
      <div className="flex items-center gap-3 px-0 py-3 border-b transition-colors duration-300"
        style={{ borderColor: focused ? '#dc143c' : '#e5e7eb' }}>
        <Icon size={16} className="shrink-0 transition-colors duration-300"
          style={{ color: focused ? '#dc143c' : '#9ca3af' }} />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          onFocus={() => setFocused(true)}
          maxLength={maxLength}
          autoComplete={autoComplete}
          name={name}
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          style={{ fontSize: 15 }}
        />
        {suffix}
      </div>
      {/* 下划线滑入动画 */}
      <motion.div
        className="absolute bottom-0 left-0 h-px"
        style={{ background: '#dc143c' }}
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: focused ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function MemberLoginPage() {
  const navigate = useNavigate();
  const { login, member, loading } = useMember();
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 已登录自动跳转到商城首页
  useEffect(() => {
    if (!loading && member) navigate('/m/home', { replace: true });
  }, [member, loading, navigate]);

  const form = useForm<LoginForm>({
    defaultValues: {
      phone: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true);
    const { error } = await login(values.phone.trim(), values.password);
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('登录成功，欢迎回来');
    navigate('/m/home');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        {/* 登录表单 */}
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* 标题 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-1.5">欢迎来到众泰成</h2>
            <p className="text-sm text-primary">登录您的会员账号</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                    <FormControl>
                      <AnimatedInput
                        icon={Phone}
                        type="tel"
                        placeholder="手机号"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        maxLength={11}
                        autoComplete="off"
                        name="off-phone"
                      />
                    </FormControl>
                    <FormMessage className="text-xs pt-1" />
                  </FormItem>
                )}
              />

              {/* 密码 */}
              <FormField
                control={form.control}
                name="password"
                rules={{ required: '请输入密码' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AnimatedInput
                        icon={Lock}
                        type={showPwd ? 'text' : 'password'}
                        placeholder="密码"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        autoComplete="new-password"
                        name="off-password"
                        suffix={
                          <button type="button" tabIndex={-1}
                            onClick={() => setShowPwd(v => !v)}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1">
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span key={showPwd ? 'hide' : 'show'}
                                initial={{ opacity: 0, rotate: -10, scale: 0.8 }}
                                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                                exit={{ opacity: 0, rotate: 10, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="block">
                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                              </motion.span>
                            </AnimatePresence>
                          </button>
                        }
                      />
                    </FormControl>
                    <FormMessage className="text-xs pt-1" />
                  </FormItem>
                )}
              />

              {/* 忘记密码 */}
              <div className="flex justify-end -mt-2">
                <button type="button"
                  onClick={() => navigate('/member/forgot-password')}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  忘记密码？
                </button>
              </div>

              {/* 登录按钮 */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 text-sm font-semibold tracking-wide group relative overflow-hidden"
                  style={{ background: 'linear-gradient(90deg, #dc143c, #b91316)', border: 'none', borderRadius: 8 }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {submitting ? (
                      <motion.span key="loading"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2">
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full block"
                        />
                        登录中...
                      </motion.span>
                    ) : (
                      <motion.span key="login"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2">
                        立即登录
                        <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            </form>
          </Form>

          {/* 分割线 */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground/60 px-1">或</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* 注册入口 */}
          <motion.button
            type="button"
            onClick={() => navigate('/member/register')}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full h-11 rounded-lg border border-border text-sm font-medium text-foreground hover:border-primary/60 hover:text-primary transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            注册会员账号
            <ArrowRight size={13} />
          </motion.button>

          {/* 协议提示 */}
          <p className="text-center text-xs text-muted-foreground/50 mt-6 leading-relaxed">
            登录即表示同意
            <button type="button" className="text-muted-foreground hover:text-primary transition-colors mx-0.5">《用户协议》</button>
            与
            <button type="button" className="text-muted-foreground hover:text-primary transition-colors mx-0.5">《隐私政策》</button>
          </p>
        </motion.div>
    </div>
  );
}
