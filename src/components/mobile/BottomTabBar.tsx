// 移动端底部导航栏（全局复用）
import { Link, useLocation } from 'react-router-dom';
import { Home, Zap, UserCircle } from 'lucide-react';

const TABS = [
  { label: '首页', icon: Home, path: '/m/home' },
  { label: '进货', icon: Zap, path: '/m/rush' },
  { label: '我的', icon: UserCircle, path: '/m/member' },
];

export default function BottomTabBar() {
  const location = useLocation();
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-stretch h-14">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
