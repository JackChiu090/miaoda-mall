import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminRole } from '@/lib/roles';
import { canAccess } from '@/lib/roles';
import { ShieldOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  allowedRoles?: AdminRole[];
}

export default function RequireAuth({ children, allowedRoles }: Props) {
  const { session, adminProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 基于路径的角色权限校验
  const role = adminProfile?.role ?? null;
  if (!canAccess(role, location.pathname)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <ShieldOff size={40} className="text-muted-foreground mx-auto" />
          <p className="text-foreground font-medium">无访问权限</p>
          <p className="text-xs text-muted-foreground">您的角色（{role ?? '未知'}）无权访问此页面</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
