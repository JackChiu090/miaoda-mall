import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Phone, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

export default function MLoginPage() {
  const { login } = useMobileUser();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的手机号');
      return;
    }
    if (!password) {
      toast.error('请输入登录密码');
      return;
    }
    setLoading(true);
    try {
      const { error } = await login(phone, password);
      if (error) {
        toast.error(error);
      } else {
        toast.success('登录成功');
        // 等待 React 状态更新完成后再跳转，避免目标页读到未更新的登录态
        setTimeout(() => navigate('/m/home', { replace: true }), 50);
      }
    } catch {
      toast.error('网络异常，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MobileHeader title="登录" back />
      {/* 顶部品牌区 */}
      <div className="flex flex-col items-center pt-16 pb-10 px-6">
        <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-lg">
          <span className="text-primary-foreground font-bold text-2xl">X</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">X商城</h1>
        <p className="text-sm text-muted-foreground mt-1">私域寄卖 · 限时竞拍 · 裂变分销</p>
      </div>

      {/* 表单区 */}
      <div className="flex-1 px-6">
        <h2 className="text-lg font-semibold text-foreground mb-6">手机号登录</h2>
        <div className="space-y-4">
          {/* 手机号 */}
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="tel"
              placeholder="请输入手机号"
              className="pl-9 h-12 text-base"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              maxLength={11}
              autoComplete="off"
              name="off-phone"
            />
          </div>

          {/* 密码 */}
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type={showPwd ? 'text' : 'password'}
              placeholder="请输入登录密码"
              className="pl-9 pr-10 h-12 text-base"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="new-password"
              name="off-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPwd(v => !v)}
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Button
            className="w-full h-12 text-base font-medium"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? '登录中...' : '立即登录'}
            {!loading && <ArrowRight size={16} className="ml-1" />}
          </Button>

          <div className="flex justify-end">
            <Link to="/m/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              忘记密码？
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-sm">
          <span className="text-muted-foreground">还没有账号？</span>
          <Link to="/m/register" className="text-primary font-medium">立即注册</Link>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground pb-8 px-6">
        登录即表示同意
        <Link to="/m/agreement" className="text-primary mx-1">《用户服务协议》</Link>
        和
        <Link to="/m/agreement" className="text-primary ml-1">《隐私政策》</Link>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-3">
          <Link to="/" className="hover:text-foreground transition-colors">← 返回门户</Link>
          <span>·</span>
          <Link to="/login" className="hover:text-foreground transition-colors">管理员入口</Link>
        </div>
      </div>
    </div>
  );
}
