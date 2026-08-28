// 角色类型与权限映射
export type AdminRole = 'super_admin' | 'operator' | 'customer_service';

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: '超级管理员',
  operator: '运营',
  customer_service: '客服',
};

// 每个角色可访问的路径前缀
const SUPER_ADMIN_PATHS = [
  '/dashboard', '/banners', '/homepage-decor', '/announcements', '/agreements', '/notifications', '/settings',
  '/users', '/kyc', '/member-levels',
  '/products', '/categories', '/fee-config', '/rush-list',
  '/orders', '/transfers',
  '/accounts', '/account-detail', '/withdrawals', '/coupons', '/voucher-pool',
  '/exchange-mall',
  '/distribution', '/commissions', '/team-stats', '/promotion-records',
  '/admin-accounts',
  // 审计查询
  '/voucher-review', '/product-trace',
  // 新增业务模块（仅超级管理员）
  '/merchant-assessment',
  '/elimination',
  '/order-split',
  '/team-split',
  '/system-config',
];

const OPERATOR_PATHS = [
  '/dashboard', '/banners', '/homepage-decor', '/announcements', '/agreements', '/notifications', '/settings',
  '/users', '/kyc', '/member-levels',
  '/products', '/categories', '/fee-config', '/rush-list',
  '/orders', '/transfers',
  '/exchange-mall',
];

const CUSTOMER_SERVICE_PATHS = [
  '/users', '/kyc', '/member-levels',
  '/orders', '/transfers',
];

export const ROLE_ALLOWED_PATHS: Record<AdminRole, string[]> = {
  super_admin: SUPER_ADMIN_PATHS,
  operator: OPERATOR_PATHS,
  customer_service: CUSTOMER_SERVICE_PATHS,
};

/** 判断某角色是否可访问指定路径 */
export function canAccess(role: AdminRole | null | undefined, path: string): boolean {
  if (!role) return false;
  // 超级管理员拥有所有权限，无需路径校验
  if (role === 'super_admin') return true;
  const allowed = ROLE_ALLOWED_PATHS[role] ?? [];
  return allowed.some(p => path === p || path.startsWith(p + '/'));
}
