// X商城管理后台 - 类型定义

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  phone: string;
  nickname: string;
  avatar_url?: string;
  kyc_status: 'pending' | 'approved' | 'rejected' | 'unsubmitted';
  member_level: 'normal' | 'member' | 'captain';
  merchant_type: 'trial' | 'regular';
  invite_code: string;
  referrer_id?: string;
  is_banned: boolean;
  ban_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface RushEarlyAccess {
  id: string;
  user_id: string;
  added_by_admin?: string;
  added_at: string;
  is_used: boolean;
  used_at?: string;
  notes?: string;
  user?: Pick<User, 'phone' | 'nickname' | 'merchant_type'>;
}

export interface KycApplication {
  id: string;
  user_id: string;
  real_name: string;
  id_card_no: string;
  front_image_url?: string;
  back_image_url?: string;
  ocr_result?: Record<string, unknown>;
  auto_verified?: boolean;
  auto_verify_msg?: string;
  submitted_at?: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  user?: Pick<User, 'phone' | 'nickname'>;
}

export interface MemberLevel {
  id: string;
  code: string;
  name: string;
  description?: string;
  min_direct_referrals: number;
  min_team_depth: number;
  sort_order: number;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  parent_id?: string;
  icon_url?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  category_id?: string;
  title: string;
  description?: string;
  images: string[];
  original_price: number;
  consignment_price: number;
  consignment_fee: number;
  storage_fee: number;
  status: 'pending' | 'approved' | 'rejected' | 'sold' | 'withdrawn';
  reject_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  is_active: boolean;
  generation: number;
  condition: string;
  specs: Record<string, string>;
  parent_product_id?: string;
  created_at: string;
  updated_at: string;
  seller?: Pick<User, 'phone' | 'nickname'>;
  category?: Pick<ProductCategory, 'name'>;
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  activity_type: 'flash_sale' | 'auction';
  start_time: string;
  end_time: string;
  status: 'draft' | 'active' | 'ended' | 'cancelled';
  is_test: boolean;      // 测试模式：跳过全局时段校验，仅凭活动自身时间控制
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityProduct {
  id: string;
  activity_id: string;
  product_id: string;
  activity_price: number;
  stock: number;
  sold: number;
  sort_order: number;
  created_at: string;
  activity?: Pick<Activity, 'title'>;
  product?: Pick<Product, 'title' | 'images'>;
}

export interface Order {
  id: string;
  order_no: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  activity_id?: string;
  amount: number;
  status: 'pending_payment' | 'payment_uploaded' | 'confirmed' | 'completed' | 'cancelled' | 'disputed' | 'resell_listed';
  payment_voucher_url?: string;
  payment_time?: string;
  confirmed_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  admin_note?: string;
  resell_price?: number;
  resell_at?: string;
  is_resell?: boolean;
  created_at: string;
  updated_at: string;
  buyer?: Pick<User, 'phone' | 'nickname'>;
  seller?: Pick<User, 'phone' | 'nickname'>;
  product?: Pick<Product, 'title' | 'images'>;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  from_status?: string;
  to_status: string;
  operator_type: 'system' | 'buyer' | 'seller' | 'admin';
  operator_id?: string;
  remark?: string;
  created_at: string;
}

export interface TransferRecord {
  id: string;
  type: 'resell' | 'gift';
  from_order_id: string;
  new_order_id?: string;
  from_user_id: string;
  to_user_id?: string;
  product_id: string;
  created_at: string;
  from_user?: Pick<User, 'phone' | 'nickname'>;
  to_user?: Pick<User, 'phone' | 'nickname'>;
  product?: Pick<Product, 'title'>;
}

export interface VirtualAccount {
  id: string;
  user_id: string;
  account_type: 'bonus' | 'balance' | 'points' | 'coupon' | 'promotion';
  balance: number;
  total_in: number;
  total_out: number;
  updated_at: string;
}

export interface AccountTransaction {
  id: string;
  account_id: string;
  user_id: string;
  account_type: string;
  type: 'in' | 'out' | 'freeze' | 'unfreeze';
  amount: number;
  balance_after: number;
  related_order_id?: string;
  description: string;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  account_type: 'points' | 'promotion';
  amount: number;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  reject_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  paid_at?: string;
  created_at: string;
  user?: Pick<User, 'phone' | 'nickname'>;
}

export interface CouponTemplate {
  id: string;
  name: string;
  face_value: number;
  min_amount: number;
  valid_days: number;
  total_count: number;
  issued_count: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

export interface UserCoupon {
  id: string;
  user_id: string;
  template_id: string;
  face_value: number;
  expired_at: string;
  status: 'unused' | 'used' | 'expired';
  used_at?: string;
  used_order_id?: string;
  created_at: string;
  user?: Pick<User, 'phone' | 'nickname'>;
  template?: Pick<CouponTemplate, 'name'>;
}

export interface VoucherPool {
  id: string;
  accumulated: number;
  threshold: number;
  total_exchanged_count: number;
  last_exchange_at?: string;
  updated_at: string;
}

export interface DistributionRelation {
  id: string;
  user_id: string;
  parent_id?: string;
  level: number;
  path: string;
  created_at: string;
  user?: Pick<User, 'phone' | 'nickname' | 'member_level'>;
  parent?: Pick<User, 'phone' | 'nickname'>;
}

export interface CommissionRecord {
  id: string;
  order_id: string;
  order_amount: number;
  recipient_id: string;
  commission_type: 'merchant_bonus' | 'boss_bonus' | 'captain_direct' | 'voucher_reserve';
  rate: number;
  amount: number;
  status: 'settled' | 'pending' | 'failed';
  settled_at: string;
  created_at: string;
  recipient?: Pick<User, 'phone' | 'nickname'>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'notice' | 'promotion' | 'system';
  status: 'draft' | 'published' | 'withdrawn';
  published_at?: string;
  withdrawn_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformAgreement {
  id: string;
  code: string;
  title: string;
  content: string;
  version: string;
  is_active: boolean;
  updated_by?: string;
  updated_at: string;
}

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  type: 'system' | 'order' | 'account' | 'promotion';
  is_read: boolean;
  is_broadcast: boolean;
  created_at: string;
}

export interface PaymentAccount {
  id: string;
  user_id: string;
  account_type: 'bank' | 'alipay' | 'wechat';
  account_no: string;
  account_name: string;
  bank_name?: string;
  is_default: boolean;
  created_at: string;
}

// 分页
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
