import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname ?? '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('请输入账号和密码');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error('登录失败：' + error);
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* 左侧品牌区 */}
      <div className="hidden lg:flex flex-col justify-between w-[58%] bg-card border-r border-border p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-sm flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg leading-none">X</span>
          </div>
          <span className="text-foreground font-medium text-base tracking-wide">X商城管理后台</span>
        </div>

        <div className="space-y-8">
          {/* 装饰性网格图案 */}
          <div className="grid grid-cols-6 gap-1 w-48 opacity-20">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="w-full aspect-square border border-border rounded-sm" />
            ))}
          </div>

          <div>
            <h2 className="text-3xl font-medium text-foreground leading-tight mb-4 text-balance">
              C2C寄卖 · 竞拍进货<br />多级分销运营平台
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm text-pretty">
              统一管理用户、商品、订单、资金与分销体系，
              提供实时数据监控与精细化运营能力。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '用户管理', desc: '实名认证 · 等级体系' },
              { label: '交易管理', desc: '进货竞拍 · 凭证留存' },
              { label: '分销体系', desc: '邀请绑定 · 奖金结算' },
            ].map(item => (
              <div key={item.label} className="border border-border rounded-sm p-3">
                <p className="text-xs font-medium text-foreground mb-1">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © 2024 X商城 · 信息撮合服务平台
        </p>
      </div>

      {/* 右侧登录表单区 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
              <span className="text-primary-foreground font-bold leading-none">X</span>
            </div>
            <span className="text-foreground font-medium">X商城管理后台</span>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck size={18} className="text-primary" />
            <h1 className="text-lg font-medium text-foreground">管理员登录</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">邮箱账号</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@xmall.com"
                className="h-9 text-sm bg-muted border-border"
                autoComplete="off"
                name="off-email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-muted-foreground">登录密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="h-9 text-sm bg-muted border-border pr-9"
                  autoComplete="new-password"
                  name="off-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-9 text-sm mt-2"
              disabled={loading}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            仅限授权管理员访问，请妥善保管账号信息
          </p>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">← 返回门户</button>
            <span>·</span>
            <button onClick={() => navigate('/m/login')} className="hover:text-foreground transition-colors">进入用户商城</button>
          </div>
        </div>
      </div>
    </div>
  );
}
