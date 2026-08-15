import { useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function PortalPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* 顶部品牌栏 */}
      <header className="border-b border-border px-6 py-3 bg-card/80 backdrop-blur-sm">
        <div className="relative flex items-center h-10 max-w-lg mx-auto">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-xs">ZTC</span>
            </div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            <span className="font-bold text-foreground text-base leading-tight">众泰成商城</span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">C2C寄卖 · 竞拍 · 分销</span>
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* 品牌标题区 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4">
            <ShoppingBag size={28} className="text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#b91316] mb-2">众泰成商城</h1>
          <p className="text-sm text-muted-foreground">专业的 C2C 寄卖 · 竞拍 · 分销一体化平台</p>
        </div>

        {/* 会员入口卡片（主入口） */}
        <div className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                <ShoppingBag size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">会员中心</h2>
                <p className="text-xs text-muted-foreground mt-0.5">注册或登录您的会员账号</p>
              </div>
            </div>

            {/* 主操作按钮 */}
            <Button
              className="w-full h-11 font-medium gap-2"
              onClick={() => navigate('/member/register')}
            >
              <UserPlus size={16} /> 注册会员
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 font-medium gap-2"
              onClick={() => navigate('/member/login')}
            >
              <LogIn size={16} /> 会员登录
            </Button>

            {/* 进入商城（次操作） */}
            <Button
              variant="ghost"
              className="w-full h-9 text-sm gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/m/home')}
            >
              直接浏览商城 <ArrowRight size={14} />
            </Button>
          </div>


        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border">
        众泰成商城 © 2024
      </footer>
    </div>
  );
}
