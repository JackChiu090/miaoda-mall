import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Package, ShoppingBag, SlidersHorizontal, Flame, Clock, Zap, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';

interface Product {
  id: string;
  title: string;
  description: string | null;
  consignment_price: number;
  images: string[];
  generation: number;
  category_id: string | null;
  created_at: string;
  resell_at: string | null;
  is_resell: boolean;
  seller_id: string | null;
  product_categories: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

interface MarketConfig {
  openHour: number;
  openMinute: number;
  cutoffHour: number;
  cutoffMinute: number;
  buyStartHour: number;
  buyStartMinute: number;
  buyEndHour: number;
  buyEndMinute: number;
}

/** 格式化倒计时为 HH:MM:SS */
function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

/** 计算今日开市时间戳 */
function getTodayOpenTs(h: number, min: number): number {
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

/** 计算"昨天 HH:MM"的 ISO 字符串 */
function getYesterdayCutoff(h: number, min: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

export default function MMarketPage() {
  const navigate = useNavigate();
  const { mobileUser } = useMobileUser();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [buying, setBuying] = useState<string | null>(null);

  // 市场配置
  const [config, setConfig] = useState<MarketConfig>({
    openHour: 9, openMinute: 0,
    cutoffHour: 14, cutoffMinute: 20,
    buyStartHour: 9, buyStartMinute: 30,
    buyEndHour: 9, buyEndMinute: 35,
  });

  // 倒计时 & 进货状态
  const [countdown, setCountdown] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [buyPhase, setBuyPhase] = useState<'before' | 'active' | 'ended'>('before');
  const [buyCountdown, setBuyCountdown] = useState(0);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 被推荐人总数 & 今日可抢上限
  // 阶梯规则：0人→0单；1人→2单；2人→3单；...；5人→6单（封顶，参数可调）
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [todayOrderCount, setTodayOrderCount] = useState<number | null>(null);
  const [maxPerDay, setMaxPerDay] = useState(6);

  const loadRushStats = useCallback(async () => {
    if (!mobileUser) return;
    const bjTodayStart = new Date(Math.floor((Date.now() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000).toISOString();
    const [{ count: todayCnt }, { data: referredUsers }, { data: maxRow }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', mobileUser.id).gte('created_at', bjTodayStart),
      supabase.from('users').select('id').eq('referrer_id', mobileUser.id),
      supabase.from('system_settings').select('value').eq('key', 'rush_max_per_day').maybeSingle(),
    ]);
    // 主场阶梯依据：被推荐人总数（不管是否完成订单交易都计算）
    const referredIds = (referredUsers ?? []).map((u: { id: string }) => u.id);
    const completedRefCnt = referredIds.length;
    setReferralCount(completedRefCnt);
    setTodayOrderCount(todayCnt ?? 0);
    setMaxPerDay(parseInt(maxRow?.value ?? '6') || 6);
  }, [mobileUser]);

  // 读取系统配置
  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('key,value')
      .in('key', [
        'market_open_hour', 'market_open_minute',
        'resell_cutoff_hour', 'resell_cutoff_minute',
        'market_buy_start_hour', 'market_buy_start_minute',
        'market_buy_end_hour', 'market_buy_end_minute',
      ]);
    if (!data) return;
    const m: Record<string, number> = {};
    data.forEach(r => { m[r.key] = parseInt(r.value) || 0; });
    const cfg: MarketConfig = {
      openHour:       m['market_open_hour']        ?? 9,
      openMinute:     m['market_open_minute']      ?? 0,
      cutoffHour:     m['resell_cutoff_hour']      ?? 14,
      cutoffMinute:   m['resell_cutoff_minute']    ?? 20,
      buyStartHour:   m['market_buy_start_hour']   ?? 9,
      buyStartMinute: m['market_buy_start_minute'] ?? 30,
      buyEndHour:     m['market_buy_end_hour']     ?? 9,
      buyEndMinute:   m['market_buy_end_minute']   ?? 35,
    };
    setConfig(cfg);
    return cfg;
  }, []);

  // 加载商品 + 当前用户已购商品ID
  const loadProducts = useCallback(async (cfg: MarketConfig) => {
    const cutoffIso = getYesterdayCutoff(cfg.cutoffHour, cfg.cutoffMinute);
    // 同时加载：寄卖商品（is_resell=false）+ 昨天截止后的转拍商品（is_resell=true）
    const [consignRes, resellRes] = await Promise.all([
      supabase
        .from('products')
        .select('id,title,description,consignment_price,images,generation,category_id,created_at,resell_at,is_resell,seller_id,product_categories(name)')
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('is_resell', false)
        .not('seller_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id,title,description,consignment_price,images,generation,category_id,created_at,resell_at,is_resell,seller_id,product_categories(name)')
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('is_resell', true)
        .gte('resell_at', cutoffIso)
        .order('resell_at', { ascending: false }),
    ]);
    // 寄卖商品排前面（活动开始前已可预览），转拍商品跟后
    const merged = [
      ...((consignRes.data as unknown as Product[]) ?? []),
      ...((resellRes.data as unknown as Product[]) ?? []),
    ];
    const catsRes = await supabase.from('product_categories').select('id,name').eq('is_active', true).order('sort_order');
    setProducts(merged);
    setCategories(catsRes.data ?? []);

    if (mobileUser) {
      const { data: ordersData } = await supabase.from('orders')
        .select('product_id')
        .eq('buyer_id', mobileUser.id)
        .in('status', ['pending_payment', 'payment_uploaded', 'confirmed', 'completed']);
      if (ordersData) setPurchasedIds(new Set(ordersData.map((o: { product_id: string }) => o.product_id)));
    }
    setLoading(false);
  }, [mobileUser]);

  const refreshAll = useCallback(async () => {
    const cfg = await loadConfig();
    if (cfg) await loadProducts(cfg);
    await loadRushStats();
  }, [loadConfig, loadProducts, loadRushStats]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const { pullDistance, isRefreshing } = usePullToRefresh(refreshAll);

  // 倒计时逻辑：同时管理「开市」和「进货时段」
  useEffect(() => {
    function tick() {
      const now = Date.now();
      const openTs     = getTodayOpenTs(config.openHour,     config.openMinute);
      const buyStartTs = getTodayOpenTs(config.buyStartHour, config.buyStartMinute);
      const buyEndTs   = getTodayOpenTs(config.buyEndHour,   config.buyEndMinute);

      const opened = now >= openTs;
      setIsOpen(opened);

      // 距开市倒计时
      setCountdown(opened ? 0 : Math.max(0, openTs - now));

      if (now < buyStartTs) {
        setBuyPhase('before');
        setBuyCountdown(buyStartTs - now); // 距进货开始
      } else if (now < buyEndTs) {
        setBuyPhase('active');
        setBuyCountdown(buyEndTs - now);   // 距进货结束
      } else {
        setBuyPhase('ended');
        setBuyCountdown(0);
      }
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [config]);

  // 抢拍下单
  async function handleFlashBuy(p: Product) {
    if (!mobileUser) { navigate('/m/login'); return; }
    if (buyPhase !== 'active') {
      toast.error(buyPhase === 'before'
        ? `进货 ${config.buyStartHour}:${String(config.buyStartMinute).padStart(2,'0')} 才开始，请稍候`
        : '本轮进货已结束，请明天再来');
      return;
    }
    // 检查今日进货数限制（主场阶梯：0人→0单；N人(正式商家)→N+1单，封顶 maxPerDay 单）
    const bjTodayStart2 = new Date(Math.floor((Date.now() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000).toISOString();
    const [{ count: todayCnt }, { data: referredUsers2 }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', mobileUser.id).gte('created_at', bjTodayStart2),
      supabase.from('users').select('id').eq('referrer_id', mobileUser.id),
    ]);
    const referredIds2 = (referredUsers2 ?? []).map((u: { id: string }) => u.id);
    // 主场阶梯依据：被推荐人总数（不管是否完成订单交易都计算）
    const rc = referredIds2.length;
    // 体验商家主场无法购买
    if (mobileUser.merchant_type !== 'regular') {
      toast.error('体验商家无法参与主场进货，请先推广商家升级为正式商家');
      return;
    }
    // 阶梯计算：0人→0单；N人→N+1单，封顶 maxPerDay 单
    const dayLimit = rc === 0 ? 0 : Math.min(rc + 1, maxPerDay);
    if (dayLimit === 0) {
      toast.error('主场进货需至少推荐 1 位好友才可参与');
      return;
    }
    if ((todayCnt ?? 0) >= dayLimit) {
      const hint = rc < maxPerDay - 1 ? `，推荐更多好友可提升上限（最多${maxPerDay}单）` : '';
      toast.error(`今日进货已达上限（${dayLimit}单）${hint}`);
      return;
    }

    setBuying(p.id);
    const { error } = await supabase.from('orders').insert({
      buyer_id: mobileUser.id,
      product_id: p.id,
      amount: p.consignment_price,
      status: 'pending_payment',
      order_no: `ORD${Date.now()}`,
    });
    setBuying(null);
    if (error) { toast.error('抢拍失败，请重试'); return; }
    setPurchasedIds(prev => new Set([...prev, p.id]));
    toast.success('抢拍成功！请尽快上传付款凭证');
    await supabase.from('products').update({ is_active: false }).eq('id', p.id);
  }

  const filtered = products.filter(p => {
    const matchCat = activeCat === 'all' || p.category_id === activeCat;
    const matchSearch = p.title.includes(search) || (p.description ?? '').includes(search);
    return matchCat && matchSearch;
  });

  const cutoffLabel   = `${config.cutoffHour}:${String(config.cutoffMinute).padStart(2, '0')}`;
  const openLabel     = `${config.openHour}:${String(config.openMinute).padStart(2, '0')}`;
  const buyStartLabel = `${config.buyStartHour}:${String(config.buyStartMinute).padStart(2,'0')}`;
  const buyEndLabel   = `${config.buyEndHour}:${String(config.buyEndMinute).padStart(2,'0')}`;

  return (
    <>
      <div className="min-h-screen bg-background pb-24">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {/* ── 顶栏 ── */}
        <div className="bg-card border-b border-border px-4 pt-10 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-foreground">进货市场</h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SlidersHorizontal size={13} />
              <span>{filtered.length} 件</span>
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索商品名称"
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── 倒计时横幅（未开市时显示） ── */}
        {!isOpen && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">距今日开市还有</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  每天 {openLabel} 准时开市 · 展示前日 {cutoffLabel} 后转拍商品
                </p>
              </div>
              <div className="shrink-0 bg-primary text-primary-foreground rounded-xl px-3 py-2 text-center min-w-[80px]">
                <p className="text-base font-bold font-mono leading-none tracking-widest">{formatCountdown(countdown)}</p>
                <p className="text-[9px] mt-0.5 opacity-80">敬请期待</p>
              </div>
            </div>
          </div>
        )}

        {/* ── 进货导航条（开市后全程显示） ── */}
        {isOpen && (
          <div className={`mx-4 mt-3 rounded-2xl overflow-hidden border ${
            buyPhase === 'active'
              ? 'border-orange-300 bg-gradient-to-r from-orange-500/15 to-red-500/10'
              : buyPhase === 'before'
              ? 'border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5'
              : 'border-border bg-muted/40'
          }`}>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                buyPhase === 'active' ? 'bg-orange-500/20' : 'bg-primary/15'
              }`}>
                <Zap size={18} className={buyPhase === 'active' ? 'text-orange-500' : 'text-primary'} />
              </div>
              <div className="flex-1 min-w-0">
                {buyPhase === 'before' && (
                  <>
                    <p className="text-xs font-semibold text-foreground">进货即将开始</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {buyStartLabel} – {buyEndLabel} 限时进货，共 <span className="font-medium text-foreground">{products.length}</span> 件
                    </p>
                  </>
                )}
                {buyPhase === 'active' && (
                  <>
                    <p className="text-xs font-semibold text-orange-600">🔥 进货进行中！</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {buyEndLabel} 结束 · 共 <span className="font-medium text-foreground">{products.length}</span> 件，手快有手慢无
                    </p>
                  </>
                )}
                {buyPhase === 'ended' && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground">本轮进货已结束</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">明天 {buyStartLabel} 再来进货</p>
                  </>
                )}
              </div>
              {buyPhase !== 'ended' && (
                <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[80px] ${
                  buyPhase === 'active'
                    ? 'bg-orange-500 text-white'
                    : 'bg-primary text-primary-foreground'
                }`}>
                  <p className="text-base font-bold font-mono leading-none tracking-widest">{formatCountdown(buyCountdown)}</p>
                  <p className="text-[9px] mt-0.5 opacity-80">{buyPhase === 'active' ? '距结束' : '距进货'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 今日进货资格卡片（已登录时显示） ── */}
        {mobileUser && referralCount !== null && (
          <div className="mx-4 mt-2 rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-stretch divide-x divide-border">
              {/* 被推荐人总数 */}
              <div className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5">
                <span className="text-lg font-black text-primary leading-none">{referralCount}</span>
                <span className="text-[10px] text-muted-foreground">被推荐人</span>
              </div>
              {/* 今日可抢 */}
              <div className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5">
                {(() => {
                  const dayLimit = referralCount === 0 ? 0 : Math.min(referralCount + 1, maxPerDay);
                  return (
                    <>
                      <span className={`text-lg font-black leading-none ${dayLimit === 0 ? 'text-destructive' : 'text-orange-500'}`}>
                        {dayLimit === 0 ? '0' : dayLimit}
                      </span>
                      <span className="text-[10px] text-muted-foreground">今日可抢</span>
                    </>
                  );
                })()}
              </div>
              {/* 已抢 / 剩余 */}
              <div className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5">
                {(() => {
                  const dayLimit = referralCount === 0 ? 0 : Math.min(referralCount + 1, maxPerDay);
                  const used = Math.min(todayOrderCount ?? 0, dayLimit);
                  const left = Math.max(dayLimit - used, 0);
                  return (
                    <>
                      <span className={`text-lg font-black leading-none ${left === 0 ? 'text-muted-foreground' : 'text-green-600'}`}>
                        {left}
                      </span>
                      <span className="text-[10px] text-muted-foreground">剩余可抢</span>
                    </>
                  );
                })()}
              </div>
            </div>
            {/* 底部提示行 */}
            {(() => {
              const dayLimit = referralCount === 0 ? 0 : Math.min(referralCount + 1, maxPerDay);
              if (dayLimit === 0) {
                return (
                  <div className="bg-destructive/5 border-t border-destructive/20 px-3 py-1.5 flex items-center gap-1.5">
                    <Lock size={11} className="text-destructive shrink-0" />
                    <span className="text-[10px] text-destructive">
                      需至少推荐 1 位好友才可参与主场进货
                    </span>
                  </div>
                );
              }
              const used = Math.min(todayOrderCount ?? 0, dayLimit);
              const left = Math.max(dayLimit - used, 0);
              if (left === 0) {
                return (
                  <div className="bg-muted/60 border-t border-border px-3 py-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                    <span className="text-[10px] text-muted-foreground">
                      今日份额已用完，推荐更多好友可提升上限（最多{maxPerDay}单）
                    </span>
                  </div>
                );
              }
              return (
                <div className="bg-orange-500/5 border-t border-orange-200/50 px-3 py-1.5 flex items-center gap-1.5">
                  <Zap size={11} className="text-orange-500 shrink-0" />
                  <span className="text-[10px] text-orange-600">
                    今日还可抢 {left} 单 · 已推荐 {referralCount} 人 → 上限 {dayLimit} 单
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 说明横幅 ── */}
        <div className="mx-4 mt-2 bg-muted/60 border border-border rounded-xl px-4 py-2.5 flex items-center gap-2">
          <ShoppingBag size={13} className="text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            寄卖商品活动前可预览 · 昨天 <span className="font-medium text-foreground">{cutoffLabel}</span> 后转拍商品 · 每日 <span className="font-medium text-foreground">{openLabel}</span> 开市
          </p>
        </div>

        {/* ── 分类标签 ── */}
        <div className="overflow-x-auto whitespace-nowrap px-4 py-2.5 border-b border-border bg-card flex gap-2">
          {[{ id: 'all', name: '全部' }, ...categories].map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-colors shrink-0
                ${activeCat === c.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* ── 商品列表（瀑布流双列） ── */}
        <div className="px-4 pt-3">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={`rounded-xl ${i % 3 === 0 ? 'h-72' : 'h-60'}`} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? '未找到相关商品' : '暂无进货商品，请等待每天开市'}</p>
            </div>
          ) : (
            /* 瀑布流：columns-2，每张卡片 break-inside-avoid */
            <div className="columns-2 gap-3 space-y-0">
              {filtered.map(p => {
                const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
                const isHot = p.generation > 1;
                const isBuying = buying === p.id;
                const isPurchased = purchasedIds.has(p.id);
                const isPreheating = isOpen && buyPhase === 'before';
                const notActive = buyPhase !== 'active';
                const handlePreviewClick = () => {
                  if (notActive) { toast('活动未开始，请耐心等待 🕐', { icon: '⏳' }); }
                };
                return (
                  <div key={p.id} className="break-inside-avoid mb-3 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                    {/* 商品图（4:3 比例，瀑布流内自适应宽度） */}
                    <div
                      className="relative w-full aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden cursor-pointer active:opacity-90"
                      onClick={handlePreviewClick}
                    >
                      {img
                        ? <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : <Package size={28} className="text-muted-foreground" />}
                      {/* 角标 */}
                      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                        {p.is_resell ? (
                          <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full leading-none flex items-center gap-0.5">
                            <Zap size={8} />转拍
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full leading-none flex items-center gap-0.5">
                            <ShoppingBag size={8} />寄卖
                          </span>
                        )}
                        {isHot && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                            <Flame size={8} />第{p.generation}代
                          </span>
                        )}
                      </div>
                      {/* 未开市遮罩 */}
                      {!isOpen && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-1">
                            <Lock size={16} className="text-white" />
                            <span className="text-[10px] text-white font-medium">{openLabel} 开市</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 信息区 */}
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <p
                        className="text-xs font-medium text-foreground leading-snug cursor-pointer"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        onClick={handlePreviewClick}
                      >{p.title}</p>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-primary font-bold text-sm">¥{p.consignment_price.toLocaleString()}</span>
                        {p.product_categories?.name && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{p.product_categories.name}</Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Package size={9} />库存 1件</span>
                      {p.resell_at && (
                        <p className="text-[10px] text-muted-foreground">
                          转拍于 {new Date(p.resell_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}

                      {/* 抢拍按钮 */}
                      {isPurchased ? (
                        <div className="w-full h-8 rounded-md bg-green-500/10 border border-green-300/50 flex items-center justify-center gap-1">
                          <CheckCircle2 size={12} className="text-green-600" />
                          <span className="text-xs font-medium text-green-700">已完成请购</span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className={`w-full h-8 text-xs gap-1 ${buyPhase === 'active' && isOpen ? 'bg-orange-500 hover:bg-orange-600 text-white border-0' : isPreheating ? 'bg-orange-50 border border-orange-200 text-orange-500 hover:bg-orange-100' : ''}`}
                          disabled={isBuying || buyPhase === 'ended' || !isOpen}
                          onClick={() => {
                            if (isPreheating || !isOpen) { toast('活动未开始，请耐心等待 🕐', { icon: '⏳' }); return; }
                            handleFlashBuy(p);
                          }}
                        >
                          {isBuying ? (
                            <><span className="animate-spin inline-block">⏳</span>进货中...</>
                          ) : !isOpen ? (
                            <><Lock size={11} />未开始</>
                          ) : isPreheating ? (
                            <><Clock size={11} />即将进货</>
                          ) : buyPhase === 'active' ? (
                            <><Zap size={11} />立即进货</>
                          ) : (
                            <><Lock size={11} />进货已结束</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <BottomTabBar />
    </>
  );
}
