import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, Zap, Wallet, User } from 'lucide-react';

interface TabItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { label: '首页', path: '/m/home', icon: Home },
  { label: '进货', path: '/m/rush', icon: Zap },
  { label: '钱包', path: '/m/wallet', icon: Wallet },
  { label: '我的', path: '/m/profile', icon: User },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const tabPaths = TABS.map(t => t.path);
  const isTabPage = tabPaths.some(p => location.pathname === p);

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background relative">
      <main className={cn('flex-1 overflow-y-auto', isTabPage ? 'pb-16' : 'pb-4')}>
        {children}
      </main>
      {isTabPage && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border flex items-center z-50">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
