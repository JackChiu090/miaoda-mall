import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import RequireAuth from '@/components/common/RequireAuth';

// 系统门户
import PortalPage from './pages/PortalPage';

// 认证
import LoginPage from './pages/LoginPage';

// ========== 移动端用户页面 ==========
import MLoginPage from './pages/mobile/MLoginPage';
import MRegisterPage from './pages/mobile/MRegisterPage';
import MHomePage from './pages/mobile/MHomePage';
import MProfilePage from './pages/mobile/MProfilePage';
import MAuthPage from './pages/mobile/MAuthPage';
import MInvitePage from './pages/mobile/MInvitePage';
import MNoticesPage from './pages/mobile/MNoticesPage';
import MNoticeDetailPage from './pages/mobile/MNoticeDetailPage';
import MAgreementPage from './pages/mobile/MAgreementPage';
import MMarketPage from './pages/mobile/MMarketPage';
import MProductDetailPage from './pages/mobile/MProductDetailPage';
import MConsignPage from './pages/mobile/MConsignPage';
import MRushPage from './pages/mobile/MRushPage';
import MOrdersPage from './pages/mobile/MOrdersPage';
import MOrderDetailPage from './pages/mobile/MOrderDetailPage';
import MPaymentPage from './pages/mobile/MPaymentPage';
import MConfirmPage from './pages/mobile/MConfirmPage';
import MWalletPage from './pages/mobile/MWalletPage';
import MWalletDetailPage from './pages/mobile/MWalletDetailPage';
import MMorningRewardPage from './pages/mobile/MMorningRewardPage';
import MExchangePage from './pages/mobile/MExchangePage';
import MBindCardPage from './pages/mobile/MBindCardPage';
import MTeamPage from './pages/mobile/MTeamPage';
import MCommissionsPage from './pages/mobile/MCommissionsPage';
import MSecurityPage from './pages/mobile/MSecurityPage';
import MForgotPasswordPage from './pages/mobile/MForgotPasswordPage';
import MAddressPage from './pages/mobile/MAddressPage';

// 系统管理
import AdminAccountsPage from './pages/system/AdminAccountsPage';
import MMemberPage from './pages/mobile/MMemberPage';
import MBuyWarehousePage from './pages/mobile/MBuyWarehousePage';
import MSellWarehousePage from './pages/mobile/MSellWarehousePage';
import HomepageDecorPage from './pages/operations/HomepageDecorPage';
import BannerManagePage from './pages/operations/BannerManagePage';
import PageDesignerPage from './pages/operations/PageDesignerPage';

// 运营管理
import DashboardPage from './pages/DashboardPage';
import AnnouncementsPage from './pages/operations/AnnouncementsPage';
import AgreementsPage from './pages/operations/AgreementsPage';
import SettingsPage from './pages/operations/SettingsPage';
import NotificationsPage from './pages/operations/NotificationsPage';

// 用户管理
import UsersPage from './pages/users/UsersPage';
import UserDetailPage from './pages/users/UserDetailPage';
import KycPage from './pages/users/KycPage';
import MemberLevelsPage from './pages/users/MemberLevelsPage';
import ReferralGraphPage from './pages/users/ReferralGraphPage';

// 商品管理
import ProductsPage from './pages/products/ProductsPage';
import ConsignOnSalePage from './pages/products/ConsignOnSalePage';
import ConsignManagePage from './pages/products/ConsignManagePage';
import CategoriesPage from './pages/products/CategoriesPage';
import RushListPage from './pages/products/RushListPage';
import FeeConfigPage from './pages/products/FeeConfigPage';
import RushProductsPage from './pages/products/RushProductsPage';

// 订单管理
import OrdersPage from './pages/orders/OrdersPage';
import OrdersPage2 from './pages/orders/OrdersPage2';
import OrderDetailPage from './pages/orders/OrderDetailPage';
import TransfersPage from './pages/orders/TransfersPage';

// 资金管理
import AccountsOverviewPage from './pages/finance/AccountsOverviewPage';
import AccountDetailPage from './pages/finance/AccountDetailPage';
import VoucherPoolPage from './pages/finance/VoucherPoolPage';
import ExchangeMallPage from './pages/finance/ExchangeMallPage';

// 分销管理
import DistributionPage from './pages/distribution/DistributionPage';
import CommissionsPage from './pages/distribution/CommissionsPage';
import TeamStatsPage from './pages/distribution/TeamStatsPage';
import PromotionRecordsPage from './pages/distribution/PromotionRecordsPage';

// 订单审计（已有）
import VoucherReviewPage from './pages/orders/VoucherReviewPage';
import ProductTracePage from './pages/products/ProductTracePage';

// 新增业务模块
import MerchantAssessmentPage from './pages/admin/MerchantAssessmentPage';
import OrderSplitPage from './pages/admin/OrderSplitPage';
import TeamSplitPage from './pages/admin/TeamSplitPage';
import SystemConfigPage from './pages/admin/SystemConfigPage';
import FlashBuyManagePage from './pages/admin/FlashBuyManagePage';
import MorningIncentivePage from './pages/admin/MorningIncentivePage';
import ClearTestDataPage from './pages/admin/ClearTestDataPage';
import FeaturedSpotlightPage from './pages/admin/FeaturedSpotlightPage';
import ResellConfigPage from './pages/admin/ResellConfigPage';

// 会员系统
import MemberRegisterPage from './pages/member/MemberRegisterPage';
import MemberLoginPage from './pages/member/MemberLoginPage';
import AdminEntryPage from './pages/AdminEntryPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
}

function guard(el: ReactNode) {
  return <RequireAuth>{el}</RequireAuth>;
}

export const routes: RouteConfig[] = [
  // 系统门户入口
  { name: '系统门户', path: '/', element: <MemberLoginPage />, public: true },

  // 登录（公开）
  { name: '登录', path: '/login', element: <LoginPage />, public: true },

  // 系统管理
  { name: '管理员账号', path: '/admin-accounts', element: guard(<AdminAccountsPage />) },

  // 运营管理
  { name: '数据仪表盘', path: '/dashboard', element: guard(<DashboardPage />) },
  { name: '公告通知', path: '/announcements', element: guard(<AnnouncementsPage />) },
  { name: '首页装修', path: '/homepage-decor', element: guard(<HomepageDecorPage />) },
  { name: 'Banner管理', path: '/banners', element: guard(<BannerManagePage />) },
  { name: '页面设计', path: '/page-designer', element: guard(<PageDesignerPage />) },
  { name: '平台协议', path: '/agreements', element: guard(<AgreementsPage />) },
  { name: '消息通知', path: '/notifications', element: guard(<NotificationsPage />) },
  { name: '系统设置', path: '/settings', element: guard(<SettingsPage />) },

  // 用户管理
  { name: '用户列表', path: '/users', element: guard(<UsersPage />) },
  { name: '用户管理', path: '/users/:id', element: guard(<UserDetailPage />) },
  { name: '实名认证审核', path: '/kyc', element: guard(<KycPage />) },
  { name: '等级管理', path: '/member-levels', element: guard(<MemberLevelsPage />) },
  { name: '推荐关系图表', path: '/referral-graph', element: guard(<ReferralGraphPage />) },

  { name: '甄选单品展示', path: '/featured-spotlight', element: guard(<FeaturedSpotlightPage />) },

  // 商品管理
  { name: '寄卖审核', path: '/products', element: guard(<ProductsPage />) },
  { name: '寄卖中', path: '/consign-on-sale', element: guard(<ConsignOnSalePage />) },
  { name: '寄卖商品管理', path: '/consign-manage', element: guard(<ConsignManagePage />) },
  { name: '商品分类', path: '/categories', element: guard(<CategoriesPage />) },
  { name: '费率配置', path: '/fee-config', element: guard(<FeeConfigPage />) },
  { name: '9:29抢单资格', path: '/rush-list', element: guard(<RushListPage />) },

  // 订单管理
  { name: '订单列表', path: '/orders', element: guard(<OrdersPage />) },
  { name: '订单列表2', path: '/orders-v2', element: guard(<OrdersPage2 />) },
  { name: '订单详情', path: '/orders/:id', element: guard(<OrderDetailPage />) },
  { name: '转拍/赠送记录', path: '/transfers', element: guard(<TransfersPage />) },

  // 资金管理
  { name: '账户总览', path: '/accounts', element: guard(<AccountsOverviewPage />) },
  { name: '账户明细', path: '/account-detail', element: guard(<AccountDetailPage />) },
  { name: '代金券资金池', path: '/voucher-pool', element: guard(<VoucherPoolPage />) },
  { name: '代金券兑换商城', path: '/exchange-mall', element: guard(<ExchangeMallPage />) },

  // 分销管理
  { name: '分销关系', path: '/distribution', element: guard(<DistributionPage />) },
  { name: '奖金结算记录', path: '/commissions', element: guard(<CommissionsPage />) },
  { name: '团队数据统计', path: '/team-stats', element: guard(<TeamStatsPage />) },
  { name: '推广奖金记录', path: '/promotion-records', element: guard(<PromotionRecordsPage />) },

  // 订单审计（已有）
  { name: '交易凭证核查', path: '/voucher-review', element: guard(<VoucherReviewPage />) },
  { name: '商品溯源查询', path: '/product-trace', element: guard(<ProductTracePage />) },

  // 招商考核管理
  { name: '招商考核', path: '/merchant-assessment', element: guard(<MerchantAssessmentPage />) },

  // 进货市场·抢购管理
  { name: '抢购时段管理', path: '/flash-buy-manage', element: guard(<FlashBuyManagePage />) },
  { name: '早市分级激励', path: '/morning-incentive', element: guard(<MorningIncentivePage />) },
  { name: '测试数据清除', path: '/clear-test-data', element: guard(<ClearTestDataPage />) },
  { name: '抢单商品管理', path: '/rush-products', element: guard(<RushProductsPage />) },
  { name: '转拍时间设置', path: '/resell-config', element: guard(<ResellConfigPage />) },

  // 拆单管理
  { name: '拆单管理', path: '/order-split', element: guard(<OrderSplitPage />) },

  // 拆人管理
  { name: '拆人管理', path: '/team-split', element: guard(<TeamSplitPage />) },

  // 系统配置 & 权限体系
  { name: '系统配置', path: '/system-config', element: guard(<SystemConfigPage />) },

  // ========== 会员系统路由 /member/* ==========
  { name: '会员注册', path: '/member/register', element: <MemberRegisterPage />, public: true },
  { name: '会员登录', path: '/member/login', element: <MemberLoginPage />, public: true },
  { name: '管理员入口', path: '/admin-entry', element: <AdminEntryPage />, public: true },

  // ========== 移动端用户路由 /m/* ==========
  // 默认重定向到首页
  { name: '移动端入口', path: '/m', element: <Navigate to="/m/home" replace />, public: true },

  // 认证（公开）
  { name: '用户登录', path: '/m/login', element: <MLoginPage />, public: true },
  { name: '用户注册', path: '/m/register', element: <MRegisterPage />, public: true },
  { name: '忘记密码', path: '/m/forgot-password', element: <MForgotPasswordPage />, public: true },

  // 首页 & 运营（公开可访问）
  { name: '用户首页', path: '/m/home', element: <MHomePage />, public: true },
  { name: '平台公告列表', path: '/m/notices', element: <MNoticesPage />, public: true },
  { name: '公告详情', path: '/m/notice/:id', element: <MNoticeDetailPage />, public: true },
  { name: '平台协议', path: '/m/agreement', element: <MAgreementPage />, public: true },

  // 用户中心
  { name: '个人中心', path: '/m/profile', element: <MProfilePage />, public: true },
  { name: '实名认证', path: '/m/auth', element: <MAuthPage />, public: true },
  { name: '邀请好友', path: '/m/invite', element: <MInvitePage />, public: true },
  { name: '收货地址', path: '/m/address', element: <MAddressPage />, public: true },

  // 商品域
  { name: '进货市场', path: '/m/market', element: <MMarketPage />, public: true },
  { name: '商品详情', path: '/m/product/:id', element: <MProductDetailPage />, public: true },
  // { name: '商品寄卖', path: '/m/consign', element: <MConsignPage />, public: true },  // 已隐藏：商品由管理员统一添加

  // 交易域
  { name: '限时抢单', path: '/m/rush', element: <MRushPage />, public: true },
  { name: '我的订单', path: '/m/orders', element: <MOrdersPage />, public: true },
  { name: '订单详情', path: '/m/order/:id', element: <MOrderDetailPage />, public: true },
  { name: '上传付款凭证', path: '/m/payment/:orderId', element: <MPaymentPage />, public: true },
  { name: '确认收款', path: '/m/confirm/:orderId', element: <MConfirmPage />, public: true },

  // 资金域
  { name: '我的钱包', path: '/m/wallet', element: <MWalletPage />, public: true },
  { name: '资金明细', path: '/m/wallet-detail', element: <MWalletDetailPage />, public: true },
  { name: '早市激励奖励', path: '/m/wallet/morning-reward', element: <MMorningRewardPage />, public: true },
  { name: '代金券兑换', path: '/m/exchange', element: <MExchangePage />, public: true },
  { name: '绑定银行卡', path: '/m/bind-card', element: <MBindCardPage />, public: true },

  // 分销域
  { name: '我的团队', path: '/m/team', element: <MTeamPage />, public: true },
  { name: '奖金明细', path: '/m/commissions', element: <MCommissionsPage />, public: true },

  // 会员中心
  { name: '会员中心', path: '/m/member', element: <MMemberPage />, public: true },

  // 仓库
  { name: '买单仓库', path: '/m/buy-warehouse', element: <MBuyWarehousePage />, public: true },
  { name: '卖单仓库', path: '/m/sell-warehouse', element: <MSellWarehousePage />, public: true },
];
