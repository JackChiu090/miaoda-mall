// 管理员专属入口页 /admin-entry — 对外不宣传
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Lock } from 'lucide-react';

export default function AdminEntryPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* 图标 */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-sidebar-accent rounded-2xl mb-5 shadow-lg">
          <Shield size={28} className="text-sidebar-primary" />
        </div>

        {/* 标题 */}
        <h1 className="text-sidebar-primary text-2xl font-bold mb-1">众泰成商城</h1>
        <p className="text-sidebar-foreground/60 text-sm mb-8">管理员专属入口</p>

        {/* 操作卡片 */}
        <div className="bg-sidebar-accent border border-sidebar-border rounded-2xl p-6 shadow-md">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <Lock size={15} className="text-primary" />
            </div>
            <div className="text-left">
              <div className="text-sidebar-primary text-sm font-semibold">管理后台登录</div>
              <div className="text-sidebar-foreground/50 text-xs">仅授权管理员可访问</div>
            </div>
          </div>

          <Button
            className="w-full h-11 font-semibold"
            onClick={() => navigate('/login')}
          >
            进入管理后台
          </Button>
        </div>

        <p className="text-sidebar-foreground/30 text-xs mt-8">
          此页面仅供平台授权管理员使用
        </p>
      </div>
    </div>
  );
}
