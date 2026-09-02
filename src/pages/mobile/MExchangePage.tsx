import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Coins, Gift, Users, CheckCircle2, XCircle, Package, ArrowRight, Sparkles } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';
import { useSubmitLock } from '@/hooks/use-submit-lock';

interface ExchangeItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  stock: number;
  exchanged: number;
  is_active: boolean;
  min_coupon_balance: number;
  min_direct_referrals: number;
}

interface UserEligibility {
  points: number;
  coupon: number;
  directReferrals: number;
}

interface BannerConfig {
  title: string;
  subtitle: string;
  image: string;
  bg_color: string;
}

// 条件徽标子组件
function CondBadge({ ok, label, current }: { ok: boolean; label: string; current: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${ok
      ? 'bg-green-500/10 text-green-700 border-green-300'
      : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
      {ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
      {label}
      {!ok && <span className="opacity-70">({current})</span>}
    </span>
  );
}

export default function MExchangePage() {
  const { mobileUser } = useMobileUser();
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [eligibility, setEligibility] = useState<UserEligibility>({ points: 0, coupon: 0, directReferrals: 0 });
  const [bannerCfg, setBannerCfg] = useState<BannerConfig>({ title: '代金券兑换商城', subtitle: '用代金券换好礼，感谢您的支持', image: '', bg_color: '#6366f1' });
  const [loading, setLoading] = useState(true);
  const [voucherPoolBalance, setVoucherPoolBalance] = useState(0);
  const [voucherThreshold, setVoucherThreshold] = useState(3980);
  const [minDirectReferrals, setMinDirectReferrals] = useState(3);
  const { tryLock, unlock, isPending } = useSubmitLock();
  const applyingVoucher = isPending('voucher');

  // 确认兑换弹窗
  const [confirmItem, setConfirmItem] = useState<ExchangeItem | null>(null);
  const submitting = isPending('exchange');

  useEffect(() => {
    if (!mobileUser) return;
    Promise.all([
      supabase.from('exchange_items').select('*').eq('is_active', true).gt('stock', 0).order('sort_order'),
      supabase.from('user_accounts').select('balance').eq('user_id', mobileUser.id).eq('account_type', 'points').maybeSingle(),
      supabase.from('user_accounts').select('balance').eq('user_id', mobileUser.id).eq('account_type', 'coupon').maybeSingle(),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('referrer_id', mobileUser.id),
      supabase.from('exchange_settings').select('key,value'),
      // 代金券资金池（用户 points 账户余额）
      supabase.from('user_accounts').select('balance').eq('user_id', mobileUser.id).eq('account_type', 'points').maybeSingle(),
      // 代金券兑换门槛参数
      supabase.from('system_settings').select('key,value').in('key', ['voucher_pool_redeem_threshold', 'voucher_min_direct_referrals']),
    ]).then(([itemsRes, pointsRes, couponRes, refRes, settingsRes, poolRes, configRes]) => {
      setItems((itemsRes.data as ExchangeItem[]) ?? []);
      setEligibility({
        points: pointsRes.data?.balance ?? 0,
        coupon: couponRes.data?.balance ?? 0,
        directReferrals: refRes.count ?? 0,
      });
      if (settingsRes.data) {
        const m: Record<string, string> = {};
        settingsRes.data.forEach(r => { m[r.key] = r.value; });
        setBannerCfg({
          title: m['banner_title'] ?? '代金券兑换商城',
          subtitle: m['banner_subtitle'] ?? '用代金券换好礼，感谢您的支持',
          image: m['banner_image'] ?? '',
          bg_color: m['banner_bg_color'] ?? '#6366f1',
        });
      }
      setVoucherPoolBalance(poolRes.data?.balance ?? 0);
      if (configRes.data) {
        const cm: Record<string, string> = {};
        configRes.data.forEach(r => { cm[r.key] = r.value; });
        if (cm['voucher_pool_redeem_threshold']) setVoucherThreshold(parseFloat(cm['voucher_pool_redeem_threshold']));
        if (cm['voucher_min_direct_referrals']) setMinDirectReferrals(parseInt(cm['voucher_min_direct_referrals']));
      }
      setLoading(false);
    });
  }, [mobileUser?.id]);

  function checkEligible(item: ExchangeItem) {
    return {
      pointsOk: eligibility.points >= item.points_cost,
      couponOk: eligibility.coupon >= item.min_coupon_balance,
      referralsOk: eligibility.directReferrals >= item.min_direct_referrals,
    };
  }

  function isFullyEligible(item: ExchangeItem) {
    const { pointsOk, couponOk, referralsOk } = checkEligible(item);
    return pointsOk && couponOk && referralsOk;
  }

  async function handleExchange() {
    if (!confirmItem || !mobileUser) return;
    if (!isFullyEligible(confirmItem)) { toast.error('不满足兑换条件'); return; }
    if (!tryLock('exchange')) return;

    try {
      const newPoints = eligibility.points - confirmItem.points_cost;
      const { error: deductErr } = await supabase.from('virtual_accounts')
        .update({ balance: newPoints })
        .eq('user_id', mobileUser.id)
        .eq('account_type', 'points');
      if (deductErr) { toast.error('代金券扣减失败，请重试'); return; }

      const { error: orderErr } = await supabase.from('exchange_orders').insert({
        user_id: mobileUser.id, item_id: confirmItem.id,
        points_spent: confirmItem.points_cost, status: 'pending',
      });
      if (orderErr) {
        await supabase.from('virtual_accounts').update({ balance: eligibility.points }).eq('user_id', mobileUser.id).eq('account_type', 'points');
        toast.error('提交失败，请重试'); return;
      }

      await supabase.from('exchange_items').update({ stock: confirmItem.stock - 1, exchanged: confirmItem.exchanged + 1 }).eq('id', confirmItem.id);
      setEligibility(e => ({ ...e, points: newPoints }));
      setItems(prev => prev.map(it => it.id === confirmItem.id ? { ...it, stock: it.stock - 1, exchanged: it.exchanged + 1 } : it));
      setConfirmItem(null);
      toast.success('兑换申请已提交，等待审核发货！');
    } finally {
      unlock('exchange');
    }
  }

  // 代金券兑换申请（需直推≥3人 + 资金池≥门槛）
  async function handleApplyVoucherRedeem() {
    if (!mobileUser) return;
    if (eligibility.directReferrals < minDirectReferrals) {
      toast.error(`需直推 ${minDirectReferrals} 人才能申请代金券兑换（当前 ${eligibility.directReferrals} 人）`);
      return;
    }
    if (voucherPoolBalance < voucherThreshold) {
      toast.error(`代金券资金池不足 ¥${voucherThreshold}，当前 ¥${voucherPoolBalance.toFixed(2)}`);
      return;
    }
    if (!tryLock('voucher')) return;
    try {
      const { error } = await supabase.from('voucher_redeem_requests').insert({
        user_id: mobileUser.id,
        amount: voucherPoolBalance,
        pool_snapshot: voucherPoolBalance,
        direct_count: eligibility.directReferrals,
        status: 'pending',
      });
      if (error) { toast.error('申请提交失败，请稍后重试'); return; }
      toast.success('代金券兑换申请已提交，等待平台审核！');
    } finally {
      unlock('voucher');
    }
  }

  const { coupon, directReferrals, points } = eligibility;
  const voucherRedeemable = voucherPoolBalance >= voucherThreshold && directReferrals >= minDirectReferrals;
  const voucherProgress = Math.min(100, (voucherPoolBalance / voucherThreshold) * 100);

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="代金券兑换商城" back />

      {loading ? (
        /* 骨架屏 */
        <div className="space-y-3 px-4 pt-4">
          <div className="h-32 rounded-2xl bg-muted animate-pulse" />
          <div className="h-20 rounded-xl bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />)}
          </div>
        </div>
      ) : (
        <div>
          {/* ── Banner ── */}
          <div
            className="relative mx-4 mt-4 rounded-2xl overflow-hidden min-h-32 flex flex-col justify-end"
            style={{ background: bannerCfg.image ? `url(${bannerCfg.image}) center/cover no-repeat` : bannerCfg.bg_color }}
          >
            {/* 渐变遮罩 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            {/* 装饰光斑 */}
            <div className="absolute top-3 right-4 w-16 h-16 rounded-full bg-white/10 blur-xl" />
            <div className="absolute top-6 right-10 w-8 h-8 rounded-full bg-white/15 blur-md" />
            {/* 文字内容 */}
            <div className="relative z-10 p-4 pb-5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={13} className="text-yellow-300" />
                <span className="text-[10px] text-yellow-200 font-medium tracking-wide">代金券专属好礼</span>
              </div>
              <h2 className="text-white font-bold text-lg leading-tight text-balance">{bannerCfg.title}</h2>
              <p className="text-white/75 text-xs mt-1">{bannerCfg.subtitle}</p>
              <div className="mt-3 inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-medium">
                共 {items.length} 件商品 <ArrowRight size={11} />
              </div>
            </div>
          </div>

          <div className="px-4 space-y-4 mt-4">
            {/* ── 我的资格卡 ── */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground">我的兑换资格</h3>
                <span className="text-[10px] text-muted-foreground">三项全满足可兑换</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border py-3">
                {[
                  { icon: <Coins size={16} className="text-yellow-500" />, value: points.toFixed(0), label: '代金券余额', color: 'bg-yellow-500/10' },
                  { icon: <Gift size={16} className="text-primary" />, value: coupon.toFixed(0), label: '优惠券', color: 'bg-primary/10' },
                  { icon: <Users size={16} className="text-green-600" />, value: String(directReferrals), label: '直推人数', color: 'bg-green-500/10' },
                ].map(({ icon, value, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 py-1">
                    <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>{icon}</div>
                    <p className="text-sm font-bold text-foreground leading-none">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 代金券资金池 ── */}
            <div className={`rounded-xl border overflow-hidden ${voucherRedeemable ? 'border-green-300 bg-green-50' : 'border-border bg-card'}`}>
              <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Gift size={14} className="text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">代金券储备池</span>
                </div>
                <span className="text-[10px] text-muted-foreground">满 ¥{voucherThreshold} 可兑换实物</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {/* 进度条 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-foreground">¥{voucherPoolBalance.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground">{voucherProgress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${voucherRedeemable ? 'bg-green-500' : 'bg-primary'}`}
                      style={{ width: `${voucherProgress}%` }}
                    />
                  </div>
                </div>
                {/* 前置条件 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <CondBadge ok={voucherPoolBalance >= voucherThreshold} label={`余额≥¥${voucherThreshold}`} current={Math.round(voucherPoolBalance)} />
                  <CondBadge ok={directReferrals >= minDirectReferrals} label={`直推≥${minDirectReferrals}人`} current={directReferrals} />
                </div>
                <p className="text-[10px] text-muted-foreground">代金券仅可兑换平台实物商品，不支持现金提现</p>
                <Button
                  size="sm"
                  className="w-full h-9 text-sm gap-1.5"
                  disabled={!voucherRedeemable || applyingVoucher}
                  onClick={handleApplyVoucherRedeem}
                >
                  {applyingVoucher ? '提交中...' : voucherRedeemable ? '申请代金券兑换' : '条件未满足'}
                </Button>
              </div>
            </div>

            {/* ── 商品网格 ── */}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Package size={36} className="opacity-25" />
                <p className="text-sm">暂无可兑换商品</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">兑换商品</h3>
                  <span className="text-xs text-muted-foreground">{items.length} 件在售</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {items.map(item => {
                    const { pointsOk, couponOk, referralsOk } = checkEligible(item);
                    const eligible = pointsOk && couponOk && referralsOk;
                    return (
                      <div key={item.id}
                        className={`bg-card border rounded-xl overflow-hidden flex flex-col transition-shadow ${eligible ? 'border-border shadow-sm' : 'border-border opacity-75'}`}>
                        {/* 商品图 */}
                        <div className="relative aspect-square bg-muted">
                          {item.image_url
                            ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <div className="w-full h-full flex items-center justify-center">
                                <Package size={28} className="text-muted-foreground/30" />
                              </div>}
                          {/* 库存角标 */}
                          <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded-full">
                            余{item.stock}件
                          </span>
                        </div>
                        {/* 内容区 */}
                        <div className="p-2.5 flex flex-col flex-1 gap-1.5">
                          <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</p>
                          <div className="flex items-center gap-1 mt-auto">
                            <Coins size={11} className="text-yellow-500 shrink-0" />
                            <span className="text-xs font-bold text-yellow-600">{item.points_cost.toLocaleString()}</span>
                            <span className="text-[10px] text-muted-foreground">代金券</span>
                          </div>
                          {/* 条件徽标 */}
                          <div className="flex flex-wrap gap-1">
                            <CondBadge ok={couponOk} label={`券≥${item.min_coupon_balance}`} current={coupon} />
                            <CondBadge ok={referralsOk} label={`推${item.min_direct_referrals}人`} current={directReferrals} />
                          </div>
                          <Button
                            size="sm"
                            className="w-full h-8 text-xs mt-1"
                            disabled={!eligible}
                            onClick={() => setConfirmItem(item)}
                          >
                            {eligible ? '立即兑换' : '条件不足'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 兑换说明 ── */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Gift size={12} className="text-primary" />兑换须知
              </h3>
              {[
                '兑换为实物奖励，不发放现金',
                '提交后管理员审核通过后安排发货',
                '每次兑换消耗对应代金券，扣减后不可退',
                '优惠券余额及直推人数为永久累计值',
              ].map((t, i) => (
                <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary shrink-0 mt-0.5">•</span>{t}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 确认兑换弹窗 ── */}
      <Dialog open={!!confirmItem} onOpenChange={open => { if (!open) setConfirmItem(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm">确认兑换</DialogTitle>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-4 py-1">
              <div className="bg-muted/40 rounded-lg p-3 flex gap-3 items-center">
                <div className="w-14 h-14 rounded-lg bg-muted shrink-0 flex items-center justify-center overflow-hidden">
                  {confirmItem.image_url
                    ? <img src={confirmItem.image_url} alt={confirmItem.name} className="w-full h-full object-cover" />
                    : <Package size={20} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{confirmItem.name}</p>
                  <p className="text-xs text-yellow-600 font-medium mt-0.5">消耗 {confirmItem.points_cost.toLocaleString()} 代金券</p>
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>当前代金券</span>
                  <span className="text-foreground font-medium">{points.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>兑换消耗</span>
                  <span className="text-yellow-600 font-medium">−{confirmItem.points_cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-medium">
                  <span className="text-muted-foreground">剩余代金券</span>
                  <span className="text-foreground">{(points - confirmItem.points_cost).toFixed(0)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-10 text-xs border-border" onClick={() => setConfirmItem(null)}>取消</Button>
                <Button className="flex-1 h-10 text-xs" onClick={handleExchange} disabled={submitting}>
                  {submitting ? '提交中...' : '确认兑换'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

