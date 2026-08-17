import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, Zap, ShoppingBag, ChevronRight, Megaphone,
  Package, Users, Wallet, Star, Coins, Sparkles, Clock,
} from 'lucide-react';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import BannerCarousel from '@/components/mobile/BannerCarousel';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';

interface Announcement { id: string; title: string; type: string; published_at: string; }
interface HomepageBlock { id: string; title: string; subtitle: string; link_path: string; image_url: string; bg_gradient: string; sort_order: number; }
interface ExchangePreviewItem { id: string; name: string; image_url: string | null; points_cost: number; stock: number; }
interface ExchangeBanner { title: string; subtitle: string; image: string; bg_color: string; }
interface Spotlight {
  id: string; title: string; subtitle: string | null; description: string | null;
  highlights: string[]; price: number; original_price: number | null;
  image_url: string | null; tags: string[]; product_id: string | null;
  cta_text: string; start_time: string | null; end_time: string | null; is_active: boolean;
}

const TYPE_LABELS: Record<string, string> = { notice: '通知', promotion: '活动', system: '系统' };

export default function MHomePage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [spotlightFaved, setSpotlightFaved] = useState(false);
  const [banners, setBanners] = useState<HomepageBlock[]>([]);
  const [exchangeItems, setExchangeItems] = useState<ExchangePreviewItem[]>([]);
  const [exchangeBanner, setExchangeBanner] = useState<ExchangeBanner>({ title: '代金券兑换商城', subtitle: '用代金券换好礼', image: '', bg_color: '#B60E2A' });
  const [loading, setLoading] = useState(true);
  const [bannerIdx, setBannerIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    const now = new Date().toISOString();
    const [ann, blks, exItems, exSettings, spotlightRow] = await Promise.all([
      supabase.from('announcements').select('id,title,type,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(3),
      supabase.from('homepage_blocks').select('id,title,subtitle,link_path,image_url,bg_gradient,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('exchange_items').select('id,name,image_url,points_cost,stock').eq('is_active', true).gt('stock', 0).order('sort_order').limit(4),
      supabase.from('exchange_settings').select('key,value'),
      supabase.from('featured_spotlight')
        .select('id,title,subtitle,description,highlights,price,original_price,image_url,tags,product_id,cta_text,start_time,end_time,is_active')
        .eq('is_active', true)
        .or(`start_time.is.null,start_time.lte.${now}`)
        .or(`end_time.is.null,end_time.gte.${now}`)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    setAnnouncements(ann.data ?? []);
    setBanners(blks.data ?? []);
    setSpotlight((spotlightRow.data as Spotlight | null) ?? null);
    setExchangeItems((exItems.data as ExchangePreviewItem[]) ?? []);
    if (exSettings.data) {
      const m: Record<string, string> = {};
      exSettings.data.forEach(r => { m[r.key] = r.value; });
      setExchangeBanner({
        title: m['banner_title'] ?? '代金券兑换商城',
        subtitle: m['banner_subtitle'] ?? '用代金券换好礼',
        image: m['banner_image'] ?? '',
        bg_color: m['banner_bg_color'] ?? '#6366f1',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData);

  // 自动轮播
  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 3500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length]);

  const now = new Date();

  return (
    <>
      <div className="min-h-screen bg-background pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {/* ── 顶栏：三栏布局，商城名居中，登录信息居右 ── */}
        <div className="px-4 pt-10 pb-4 bg-gradient-to-b from-[#b91316] to-[#9e1014]">
          <div className="relative flex items-center h-9">
            {/* 左：logo */}
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center shrink-0 backdrop-blur-sm">
              <span className="text-white font-bold text-[10px]">ZTC</span>
            </div>
            {/* 中：商城名（绝对居中） */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <h1 className="font-bold text-[24px] text-white tracking-wide">众泰成商城</h1>
            </div>
            {/* 右：用户信息 + Bell */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {mobileUser ? (
                <span className="text-xs text-white/90 max-w-[72px] truncate">{mobileUser.kyc_status === 'approved' && mobileUser.real_name ? mobileUser.real_name : mobileUser.nickname}</span>
              ) : (
                <Link to="/m/login" className="text-xs text-white/90 bg-white/20 rounded-full px-2.5 py-1 backdrop-blur-sm">登录</Link>
              )}
              <Link to="/m/notices" className="relative w-8 h-8 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <Bell size={16} className="text-white" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── 轮播 Banner ── */}
        <div className="px-4 pt-4">
          <BannerCarousel />
        </div>


        <div className="px-4 pt-4 space-y-4">
          {/* ── 平台公告 ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-solid border-[0px] border-[#b60e2a] bg-[#e2383800] bg-none">
              <div className="flex items-center gap-2">
                <Megaphone size={15} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">平台公告</span>
              </div>
              <Link to="/m/notices" className="text-xs text-muted-foreground flex items-center gap-0.5">全部 <ChevronRight size={12} /></Link>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
            ) : announcements.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground border-[0px] border-solid border-[#ffffff]">{"暂无公告"}</div>
            ) : (
              <div className="divide-y divide-border">
                {announcements.map(a => (
                  <Link key={a.id} to={`/m/notice/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/30">
                    <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{TYPE_LABELS[a.type] ?? a.type}</Badge>
                    <span className="flex-1 text-sm text-foreground truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {a.published_at ? new Date(a.published_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── 未登录引导 ── */}
          {!mobileUser && (
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">登录后参与进货和分销</p>
                <p className="text-xs text-muted-foreground mt-0.5">注册即享平台专属权益</p>
              </div>
              <Button size="sm" onClick={() => navigate('/m/login')} className="shrink-0 h-8 text-xs">立即登录</Button>
            </div>
          )}

          {/* ── 精选单品 焦点展示 ── */}
          {spotlight && (
            <div className="relative rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #7f0d0d 0%, #b60e2a 45%, #c0392b 100%)' }}>
              {/* 背景光晕装饰 */}
              <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 blur-xl pointer-events-none" />

              {/* 标题栏 */}
              <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-1.5">
                  <Star size={13} className="text-yellow-300 fill-yellow-300" />
                  <span className="text-white/90 text-xs font-semibold tracking-widest uppercase">精选单品</span>
                </div>
                <button
                  onClick={() => setSpotlightFaved(v => !v)}
                  className="flex items-center gap-1 text-[11px] active:scale-90 transition-transform"
                  aria-label="收藏"
                >
                  <Star
                    size={14}
                    className={spotlightFaved ? 'text-yellow-300 fill-yellow-300' : 'text-white/60'}
                  />
                  <span className={spotlightFaved ? 'text-yellow-300' : 'text-white/60'}>
                    {spotlightFaved ? '已收藏' : '收藏'}
                  </span>
                </button>
              </div>

              {/* 主图 */}
              {spotlight.image_url && (
                <div className="relative z-10 mx-4 rounded-xl overflow-hidden aspect-[4/3] bg-black/20">
                  <img
                    src={spotlight.image_url}
                    alt={spotlight.title}
                    className="w-full h-full object-cover"
                  />
                  {/* 标签角标 */}
                  {spotlight.tags.length > 0 && (
                    <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                      {spotlight.tags.slice(0, 3).map((tag, i) => (
                        <span key={i}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white border border-white/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 商品信息 */}
              <div className="relative z-10 px-4 pt-3 pb-4 space-y-2">
                <p className="text-white font-bold text-base leading-snug text-balance">{spotlight.title}</p>
                {spotlight.subtitle && (
                  <p className="text-white/75 text-xs leading-relaxed">{spotlight.subtitle}</p>
                )}

                {/* 亮点标签 */}
                {spotlight.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {spotlight.highlights.map((h, i) => (
                      <span key={i}
                        className="text-[11px] bg-white/15 text-white/90 px-2 py-0.5 rounded-full border border-white/20">
                        ✦ {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 代金券兑换专区 ── */}
          <div className="rounded-2xl overflow-hidden border border-border">
            {/* 区块 Header（读取后台 Banner 配置） */}
            <Link
              to="/m/exchange"
              className="relative flex items-center gap-3 px-4 py-4 min-h-20"
              style={
                exchangeBanner.image
                  ? { backgroundImage: `url(${exchangeBanner.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { backgroundColor: exchangeBanner.bg_color }
              }
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-black/10" />
              <div className="absolute top-1 right-8 w-12 h-12 rounded-full bg-white/10 blur-xl pointer-events-none" />
              <div className="relative z-10 flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <Sparkles size={20} className="text-yellow-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-base leading-tight text-balance">{exchangeBanner.title}</p>
                  <p className="text-white/75 text-xs mt-0.5 truncate">{exchangeBanner.subtitle}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">
                  <span className="text-white text-[11px] font-medium">进入</span>
                  <ChevronRight size={12} className="text-white" />
                </div>
              </div>
            </Link>

            {/* 商品预览行 */}
            <div className="bg-card divide-x divide-border grid grid-cols-4">
              {loading ? (
                [1, 2, 3, 4].map(i => (
                  <div key={i} className="flex flex-col items-center p-2.5 gap-1.5">
                    <Skeleton className="w-full aspect-square rounded-lg" />
                    <Skeleton className="h-2.5 w-3/4 rounded" />
                    <Skeleton className="h-2.5 w-1/2 rounded" />
                  </div>
                ))
              ) : exchangeItems.length === 0 ? (
                <div className="col-span-4 py-6 text-center text-xs text-muted-foreground">暂无兑换商品，敬请期待</div>
              ) : (
                [...exchangeItems.slice(0, 4)].map(item => (
                  <Link key={item.id} to="/m/exchange"
                    className="flex flex-col items-center p-2.5 gap-1 active:bg-muted/30 transition-colors">
                    <div className="w-full aspect-square rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : <Package size={18} className="text-muted-foreground/40" />}
                    </div>
                    <p className="text-[10px] text-foreground text-center leading-tight line-clamp-2 w-full">{item.name}</p>
                    <div className="flex items-center gap-0.5">
                      <Coins size={9} className="text-yellow-500 shrink-0" />
                      <span className="text-[10px] font-semibold text-yellow-600">{item.points_cost.toLocaleString()}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* 查看全部 */}
            <Link to="/m/exchange"
              className="flex items-center justify-center gap-1 py-2.5 bg-muted/40 border-t border-border text-xs text-muted-foreground active:bg-muted/60 transition-colors">
              查看全部兑换商品 <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>
      <BottomTabBar />
    </>
  );
}

