// 限时抢单页：两层时间体系（自定义活动优先 > 默认时段）
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Zap, Clock, Package, Flame, CalendarClock, ShoppingBag, CheckCircle2, Rocket, Bell, ListOrdered, Eye, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import MobileHeader from '@/components/mobile/MobileHeader';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';


/**
 * 服务器时钟同步：以服务器（北京时间）为唯一时间依据
 * - serverClockOffset：服务器时间与本地时间的差值（ms）
 * - getServerNow()：返回校准后的当前时间戳
 * - syncServerClock()：通过查询数据库时间获取偏移（页面挂载时调用一次）
 */
let serverClockOffset = 0;
function getServerNow(): number {
  return Date.now() + serverClockOffset;
}
async function syncServerClock(): Promise<void> {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('get_server_time');
    const t1 = Date.now();
    if (error || !data) return;
    const serverMs = new Date(data as string).getTime();
    // 用请求往返中点近似网络耗时，减少误差
    serverClockOffset = serverMs - Math.floor((t0 + t1) / 2);
  } catch {
    // 同步失败则沿用本地时间，不影响功能
  }
}

interface PreviewProduct {
  id: string;
  title: string;
  consignment_price: number;
  images: string[];
  is_resell: boolean;
  is_active: boolean;
}

/** 今日早场抢购记录（正式商家用） */
interface TodayRushOrder {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  created_at: string;
  products: { title: string; images: string[] } | null;
  seller: { real_name: string | null; nickname: string; phone: string } | null;
}

/** 抢购时段配置（来自 rush_time_slots 表） */
interface TimeSlot {
  id: string;
  name: string;
  start_minute: number;
  end_minute: number;
  price_discount: number;
  priority: number;
  is_active: boolean;
  session_type: 'early' | 'formal';
  updated_at: string;
}

/** 自定义抢购活动（覆盖默认时段） */
interface RushActivity {
  id: string;
  name: string;
  activity_date: string;
  start_minute: number;
  end_minute: number;
  price_discount: number;
  priority: number;
  is_active: boolean;
  session_type: 'early' | 'formal';
}

/** 当前生效时段的统一描述（默认时段 or 自定义活动） */
interface RushPeriod {
  id: string;
  name: string;
  start_minute: number;
  end_minute: number;
  price_discount: number;
  priority: number;
  is_active: boolean;
  session_type: 'early' | 'formal';
  source: 'default' | 'custom';
}

/** 将秒数拆分为 天/时/分/秒 */
function splitDuration(totalSec: number) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s };
}

/** 用于“下一次抢单”计算的最小时段形状（默认时段与自定义活动通用） */
type NextRushSlot = Pick<RushPeriod, 'id' | 'name' | 'start_minute' | 'end_minute' | 'session_type'>;

/**
 * ─────────── 5 阶段状态机 ────────────────────────────────────────────────────
 *  off      = 周末/无配置/09:00 前（展示下次抢单提醒）
 *  preview  = 09:00 ~ 首场开始前（只读浏览商品，不可下单）
 *  warming  = early 时段进行中（09:25～09:30：倒计时，禁止下单）
 *  trading  = formal 时段进行中（09:30～09:35：正式抢购，可下单）
 *  ended    = 今日所有场次已结束（展示下一期预告）
 * ──────────────────────────────────────────────────────────────────────────── */
type RushPhase = 'off' | 'preview' | 'warming' | 'trading' | 'ended';

/** 09:00 = 540 分钟 — 开市预览最早展示时间，早于此时刻统一显示 off */
const PREVIEW_START_MIN = 540;

function computeRushPhase(
  currentPeriod: RushPeriod | null,
  timeSlots: TimeSlot[],
  todayActivities: RushActivity[],
  nowMins: number,
  isWeekend: boolean,
): RushPhase {
  // ① 有活跃时段（resolveCurrentPeriod 实时判断，精确到分钟）
  if (currentPeriod) {
    return currentPeriod.session_type === 'early' ? 'warming' : 'trading';
  }

  // 周末：只有自定义活动才允许开市；默认时段不参与计算
  const allSlots: Array<{ start_minute: number; end_minute: number; session_type: 'early' | 'formal' }> =
    [...(isWeekend ? [] : timeSlots), ...todayActivities];
  if (allSlots.length === 0) return 'off';

  // ② 今日还有未开始的场次 → 开市预览（09:00 前仍显示 off）
  if (allSlots.some(s => s.start_minute > nowMins)) {
    return nowMins >= PREVIEW_START_MIN ? 'preview' : 'off';
  }

  // ③ 今日所有场次均已结束 → ended
  if (allSlots.every(s => nowMins >= s.end_minute)) return 'ended';

  // ④ 轮询延迟兜底：某场次正在进行但 currentPeriod 尚未更新（<1 秒间隙）
  //    直接从本地时间边界推断，避免在时间节点出现短暂闪烁
  const localActive = allSlots.find(
    s => nowMins >= s.start_minute && nowMins < s.end_minute,
  );
  if (localActive) {
    return localActive.session_type === 'early' ? 'warming' : 'trading';
  }

  // ⑤ 兜底（两场次之间的极短间隙，理论上不应出现）
  return 'off';
}

/** 从所有时段中找出 ≥ afterMinute 的首个 formal 时段开始分钟（驱动早场倒计时） */
function findFormalStart(allSlots: NextRushSlot[], afterMinute: number): number | null {
  const next = allSlots
    .filter(s => s.session_type === 'formal' && s.start_minute >= afterMinute)
    .sort((a, b) => a.start_minute - b.start_minute)[0];
  return next?.start_minute ?? null;
}

/**
 * 计算下一次抢单的开始时间（考虑工作日规则：周末顺延到下一个工作日）
 * 返回该场次的绝对时间戳（ms）、对应时段、今日是否为周末、距今天数
 */
function computeNextRush(slots: NextRushSlot[]): { ms: number; slot: NextRushSlot; isWeekend: boolean; daysAhead: number } | null {
  if (slots.length === 0) return null;
  const sorted = slots.slice().sort((a, b) => a.start_minute - b.start_minute);
  const bjNow = new Date(getServerNow() + 8 * 3600000);
  const bjMidnightToday = Math.floor(bjNow.getTime() / 86400000) * 86400000 - 8 * 3600000;
  const todayMins = bjNow.getUTCHours() * 60 + bjNow.getUTCMinutes();
  const todayDow = bjNow.getUTCDay();
  const isWeekend = todayDow === 0 || todayDow === 6;
  // 今日（工作日）仍有未开始的场次
  if (!isWeekend) {
    const todayNext = sorted.find(s => s.start_minute > todayMins);
    if (todayNext) {
      return { ms: bjMidnightToday + todayNext.start_minute * 60000, slot: todayNext, isWeekend: false, daysAhead: 0 };
    }
  }
  // 顺延到下一个工作日（最早场次）
  for (let offset = 1; offset <= 7; offset++) {
    const dayMidnight = bjMidnightToday + offset * 86400000;
    const dow = new Date(dayMidnight + 8 * 3600000).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return { ms: dayMidnight + sorted[0].start_minute * 60000, slot: sorted[0], isWeekend, daysAhead: offset };
    }
  }
  return null;
}

/** 单个数字格子 — 精致玻璃拟态版，urgent 时切换为紧张红光 */
function DigitBox({ value, label, urgent }: { value: number; label: string; urgent?: boolean }) {
  const v = String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {/* 光晕 */}
        <div className={`absolute inset-0 rounded-xl blur-md scale-110 animate-pulse ${
          urgent ? 'bg-red-400/60' : 'bg-white/30'
        }`} />
        <div className={`relative backdrop-blur-sm font-black font-mono text-4xl leading-none w-16 h-16 flex items-center justify-center rounded-xl shadow-lg text-white ${
          urgent ? 'bg-red-700/50 border border-red-300/60' : 'bg-white/20 border border-white/40'
        }`}>
          {v}
        </div>
      </div>
      <span className="text-white/80 text-xs font-medium">{label}</span>
    </div>
  );
}

/** 非抢购时段：下次抢单时间提醒模块（倒计时 + 具体日期时间 + 周末友好提示） */
function NextRushReminder({ nextRush }: { nextRush: { ms: number; slot: NextRushSlot; isWeekend: boolean; daysAhead: number } | null }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const calc = () => setSec(Math.max(0, Math.floor(((nextRush?.ms ?? 0) - getServerNow()) / 1000)));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [nextRush?.ms]);
  if (!nextRush) return null;

  const { d, h, m, s } = splitDuration(sec);
  const urgent = sec > 0 && sec <= 60;
  const soon = sec > 0 && sec <= 30 * 60;
  const dt = new Date(nextRush.ms);
  const dateStr = dt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const weekdayLabel = nextRush.isWeekend ? '周末休息日' : nextRush.daysAhead === 0 ? '今日' : nextRush.daysAhead === 1 ? '明日' : '下周';

  return (
    <div className="relative w-full overflow-hidden rounded-2xl"
      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 42%, #b91c1c 100%)' }}>
      <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-yellow-300/20 blur-2xl animate-pulse" />
      <div className="absolute -bottom-8 -left-6 w-32 h-32 rounded-full bg-white/10 blur-xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div className="relative px-5 py-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-yellow-200" />
          <span className="text-sm font-bold text-white/90">下次抢单</span>
        </div>
        <h2 className="text-2xl font-black text-white tracking-wider drop-shadow text-center">
          {nextRush.isWeekend ? '周末休息，周一见 👋' : '距开抢还有'}
        </h2>

        <div className="flex items-end justify-center gap-2">
          {d > 0 && <>
            <DigitBox value={d} label="天" urgent={urgent} />
            <span className="text-white/60 font-black text-2xl pb-5 animate-pulse">:</span>
          </>}
          <DigitBox value={h} label="时" urgent={urgent} />
          <span className="text-white/60 font-black text-2xl pb-5 animate-pulse">:</span>
          <DigitBox value={m} label="分" urgent={urgent} />
          <span className="text-white/60 font-black text-2xl pb-5 animate-pulse">:</span>
          <DigitBox value={s} label="秒" urgent={urgent} />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
            <CalendarClock size={13} className="text-yellow-200" />
            <span className="text-xs font-bold text-yellow-100">{dateStr} 开抢</span>
          </div>
          <span className="text-[11px] text-white/70">{nextRush.slot.name} · {weekdayLabel}场次</span>
        </div>

        <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border ${
          urgent ? 'bg-red-900/40 border-red-300/50 animate-pulse' : 'bg-white/15 border-white/25'
        }`}>
          <Zap size={13} className={urgent ? 'text-red-200' : 'text-yellow-200'} />
          <span className="text-white text-xs font-semibold">
            {nextRush.isWeekend ? '周末不抢单，期待下周精彩场次' : urgent ? '⚡ 最后冲刺，马上开抢！' : soon ? '🔥 预热中，即将开抢！' : '活动未开始，请耐心等待'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 早场预热倒计时横幅：显示距正式抢购开始的剩余时间（精确到秒） */
function WarmingCountdown({ targetMinute }: { targetMinute: number | null }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const calc = () => {
      if (targetMinute === null) { setSec(0); return; }
      const bjNow = new Date(getServerNow() + 8 * 3600000);
      const nowMins = bjNow.getUTCHours() * 60 + bjNow.getUTCMinutes();
      const nowSecs = bjNow.getUTCSeconds();
      const remaining = Math.max(0, (targetMinute - nowMins) * 60 - nowSecs);
      setSec(remaining);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetMinute]);

  const { m, s } = splitDuration(sec);
  const urgent = sec > 0 && sec <= 30;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl"
      style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 55%, #ef4444 100%)' }}>
      <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl animate-pulse" />
      <div className="absolute -bottom-6 -left-4 w-28 h-28 rounded-full bg-yellow-300/15 blur-xl" />
      <div className="relative px-5 py-5 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-yellow-100" />
          <span className="text-sm font-bold text-white/90">🌅 早场预热中</span>
        </div>
        {targetMinute !== null ? (
          <>
            <h2 className="text-xl font-black text-white tracking-wide drop-shadow">距正式抢购还有</h2>
            <div className="flex items-end justify-center gap-2">
              <DigitBox value={m} label="分" urgent={urgent} />
              <span className="text-white/60 font-black text-2xl pb-5 animate-pulse">:</span>
              <DigitBox value={s} label="秒" urgent={urgent} />
            </div>
          </>
        ) : (
          <h2 className="text-xl font-black text-white tracking-wide drop-shadow">抢购即将开始</h2>
        )}
        <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border ${
          urgent ? 'bg-red-900/40 border-red-300/50 animate-pulse' : 'bg-white/15 border-white/25'
        }`}>
          <Bell size={13} className={urgent ? 'text-red-200' : 'text-yellow-200'} />
          <span className="text-white text-xs font-semibold">
            {urgent ? '⚡ 即将开抢，请做好准备！' : '提前选好商品，开抢即可下单'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 开市预览横幅：轻量版，展示距首场开抢的倒计时 */
function PreviewBanner({ nextRush }: { nextRush: { ms: number; slot: NextRushSlot } | null }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const calc = () => setSec(Math.max(0, Math.floor(((nextRush?.ms ?? 0) - getServerNow()) / 1000)));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [nextRush?.ms]);
  if (!nextRush) return null;
  const { h, m, s } = splitDuration(sec);
  const urgent = sec > 0 && sec <= 60;
  const timeStr = `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${urgent ? 'bg-orange-500/10 border border-orange-300/50' : 'bg-primary/5 border border-primary/20'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Eye size={15} className="text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">{nextRush.slot.name} · 即将开抢</p>
          <p className="text-[10px] text-muted-foreground">现在可提前浏览商品，开抢后方可下单</p>
        </div>
      </div>
      <div className={`flex items-center gap-1 font-mono font-bold text-sm shrink-0 ml-3 ${urgent ? 'text-orange-500 animate-pulse' : 'text-primary'}`}>
        <Clock size={13} />
        <span>{timeStr}</span>
      </div>
    </div>
  );
}

/**
 * 动态规则提示横幅：根据商家身份(体验/正式)与所处阶段(早场/正式抢购)展示对应规则
 */
function RushRuleBanner({
  merchantType,
  sessionType,
  rc,
  dayLimit,
  used,
  slotName,
  source,
}: {
  merchantType: 'trial' | 'regular' | null;
  sessionType: 'early' | 'formal';
  rc: number;
  dayLimit: number;
  used: number;
  slotName: string;
  source: 'default' | 'custom';
}) {
  const isTrial = merchantType === 'trial';
  const isRegular = merchantType === 'regular';
  const left = Math.max(dayLimit - used, 0);

  let title = '';
  let desc = '';
  let icon = <Zap size={15} className="text-orange-500 shrink-0" />;
  let accent = 'border-orange-200/60 bg-orange-500/5';

  if (sessionType === 'early') {
    if (isTrial) {
      title = '🌅 体验商家 · 早场';
      desc = '可选择抢购最多 1 单，先到先得';
    } else if (isRegular) {
      title = '🌅 正式商家 · 早场';
      desc = `今日可抢 ${dayLimit} 单，请选好商品，正式抢购开始后手动下单`;
      icon = <Rocket size={15} className="text-orange-500 shrink-0" />;
    } else {
      title = '🌅 早场抢购';
      desc = '可选择抢购最多 1 单';
    }
  } else {
    title = '🔥 主场抢购';
    desc = `按推荐人数与被推荐人完成订单销售决定可抢单数：推荐1人→2单 / 2人→3单 / 3人→4单 / 4人→5单 / 5人→6单（封顶）。当前已完成销售的被推荐人 ${rc} 人`;
    icon = <Flame size={15} className="text-orange-500 shrink-0" />;
    accent = 'border-orange-300/60 bg-orange-500/10';
  }

  return (
    <div className={`mx-4 mt-3 rounded-xl border ${accent} px-3.5 py-3`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-foreground">{title} · {slotName}</p>
            {source === 'custom' && (
              <span className="text-[9px] font-semibold bg-primary/15 text-primary rounded px-1 py-px shrink-0">自定义活动</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            <span className="text-orange-500 font-semibold">今日可抢 {dayLimit} 单</span>
            <span className="text-muted-foreground">已抢 {used} 单</span>
            <span className={`font-bold ${left === 0 ? 'text-muted-foreground' : 'text-orange-500'}`}>剩余 {left} 单</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MRushPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // 实时 now，每秒刷新，驱动时段状态（以服务器/北京时间为准）
  const [now, setNow] = useState(() => new Date(getServerNow()));

  // 推荐人数 & 今日抢单统计
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [todayOrderCount, setTodayOrderCount] = useState<number | null>(null);
  // 正式商家今日早场抢购记录
  const [todayRushOrders, setTodayRushOrders] = useState<TodayRushOrder[]>([]);

  // ── 抢购时段配置（来自 rush_time_slots 表，支持多时段并行与优先级，唯一时间依据）──
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  // ── 今日自定义抢购活动（覆盖默认时段，优先级最高）──
  const [todayActivities, setTodayActivities] = useState<RushActivity[]>([]);
  // 早市激励配置：正式/体验商家早市首单限购数量（来自后台配置）
  const [incentiveCfg, setIncentiveCfg] = useState({ regular: 2, trial: 1 });

  /**
   * 解析当前生效时段：自定义活动优先 > 默认时段
   * 返回统一描述 RushPeriod（含 source 标识来源）
   */
  function resolveCurrentPeriod(nowMins: number): RushPeriod | null {
    // ① 自定义活动优先（同时间多活动取优先级数值最小者）
    const customMatch = todayActivities
      .filter(a => nowMins >= a.start_minute && nowMins < a.end_minute)
      .sort((a, b) => a.priority - b.priority)[0];
    if (customMatch) {
      return { ...customMatch, source: 'custom' };
    }
    // ② 默认时段（重叠时以最新配置 updated_at 为准，优先级次之）
    const matching = timeSlots.filter(s => nowMins >= s.start_minute && nowMins < s.end_minute);
    if (matching.length > 0) {
      const def = matching.reduce((a, b) => {
        const ta = new Date(a.updated_at).getTime();
        const tb = new Date(b.updated_at).getTime();
        if (tb !== ta) return tb > ta ? b : a;
        return a.priority <= b.priority ? a : b;
      });
      return { ...def, source: 'default' };
    }
    return null;
  }

  const loadRushStats = useCallback(async () => {
    if (!mobileUser) return;
    const bjTodayStart = new Date(Math.floor((getServerNow() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000).toISOString();
    const isRegular = mobileUser.merchant_type === 'regular';
    const [{ data: referredUsers }, { count: todayCnt }, rushOrdersRes, slotsRes, activitiesRes] = await Promise.all([
      // 当前用户推荐的所有用户
      supabase.from('users').select('id').eq('referrer_id', mobileUser.id),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', mobileUser.id).gte('created_at', bjTodayStart),
      // 正式商家：拉取今日抢购记录（is_rush=true）
      isRegular
        ? supabase.from('orders')
            .select('id,order_no,amount,status,created_at,products!orders_product_id_fkey(title,images),seller:users!seller_id(real_name,nickname,phone)')
            .eq('buyer_id', mobileUser.id)
            .eq('is_rush', true)
            .gte('created_at', bjTodayStart)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      // 加载启用的抢购时段配置（按优先级升序）—— 默认时间依据
      supabase.from('rush_time_slots')
        .select('id,name,start_minute,end_minute,price_discount,priority,is_active,session_type,updated_at')
        .eq('is_active', true)
        .order('priority', { ascending: true }),
      // 加载今日生效的自定义抢购活动（覆盖默认时段，优先级最高）
      supabase.from('rush_activities')
        .select('id,name,activity_date,start_minute,end_minute,price_discount,priority,is_active,session_type')
        .eq('is_active', true)
        .eq('activity_date', new Date(getServerNow() + 8 * 3600000).toISOString().slice(0, 10))
        .order('priority', { ascending: true }),
    ]);
    // 主场阶梯依据：被推荐人中"已完成订单销售"（作为买家有已完成订单）的人数
    const referredIds = (referredUsers ?? []).map((u: { id: string }) => u.id);
    let completedReferral = 0;
    if (referredIds.length > 0) {
      const { data: completedBuyers } = await supabase.from('orders')
        .select('buyer_id')
        .in('buyer_id', referredIds)
        .eq('status', 'confirmed');
      completedReferral = new Set((completedBuyers ?? []).map((o: { buyer_id: string }) => o.buyer_id)).size;
    }
    setReferralCount(completedReferral);
    setTodayOrderCount(todayCnt ?? 0);
    setTimeSlots((slotsRes.data as unknown as TimeSlot[]) ?? []);
    setTodayActivities((activitiesRes.data as unknown as RushActivity[]) ?? []);
    if (isRegular) {
      setTodayRushOrders((rushOrdersRes.data as unknown as TodayRushOrder[]) ?? []);
    }
    // 读取早市激励配置（正式/体验商家限购数量）
    const { data: cfg } = await supabase.from('morning_incentive_config')
      .select('regular_first_order_limit, trial_first_order_limit')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (cfg) {
      setIncentiveCfg({
        regular: cfg.regular_first_order_limit ?? 2,
        trial: cfg.trial_first_order_limit ?? 1,
      });
    }
  }, [mobileUser]);

  const load = useCallback(async () => {
    const prodRes = await supabase
      .from('products')
      .select('id,title,consignment_price,images,is_resell,is_active')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);  // 展示全部商品（含已被抢购的）
    const prods = (prodRes.data as unknown as PreviewProduct[]) ?? [];
    setPreviewProducts(prods);
    setLoading(false);
  }, []);

  const { pullDistance, isRefreshing } = usePullToRefresh(load);

  // 从数据库加载已被购买的商品ID（含他人已购）
  const loadPurchased = useCallback(async (prodIds: string[]) => {
    if (prodIds.length === 0) return;
    const { data } = await supabase
      .from('orders')
      .select('product_id')
      .in('product_id', prodIds)
      .not('status', 'in', '("cancelled","disputed")');
    if (data) setPurchasedIds(new Set(data.map((o: { product_id: string }) => o.product_id)));
  }, []);

  useEffect(() => { load(); loadRushStats(); }, [load, loadRushStats]);

  // 加载完商品后再加载已购状态
  useEffect(() => {
    if (previewProducts.length > 0) {
      loadPurchased(previewProducts.map(p => p.id));
    }
  }, [previewProducts, loadPurchased]);

  // 同步服务器时钟（北京时间），页面挂载时同步一次，并每秒更新 now 驱动倒计时
  useEffect(() => {
    syncServerClock();
    const t = setInterval(() => setNow(new Date(getServerNow())), 1000);
    return () => clearInterval(t);
  }, []);

  const [rushingProd, setRushingProd] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  // 购买成功弹窗
  const [successModal, setSuccessModal] = useState<{ show: boolean; title: string }>({ show: false, title: '' });

  // ── Realtime：监听其他人抢购预览商品，瞬间刷新全部列表 ──────────────────────────
  useEffect(() => {
    if (previewProducts.length === 0) return;
    const prodIds = previewProducts.map(p => p.id);
    const channel = supabase
      .channel('rush-orders-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        const newOrder = payload.new as { product_id: string; buyer_id: string };
        if (!prodIds.includes(newOrder.product_id)) return;
        // 立即标记已购，触发商品状态更新
        setPurchasedIds(prev => new Set([...prev, newOrder.product_id]));
        // 不是自己购买的才提示
        if (mobileUser && newOrder.buyer_id === mobileUser.id) return;
        const prod = previewProducts.find(p => p.id === newOrder.product_id);
        const title = prod?.title ?? '某商品';
        toast(`🔔 ${title.slice(0, 18)}${title.length > 18 ? '...' : ''} 已被他人抢购`, {
          icon: <Bell size={15} className="text-orange-500" />,
          duration: 4000,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [previewProducts, mobileUser]);

  // ── Realtime：监听抢购时段配置变更，修改后立即生效（无需刷新/重启）──────────────────
  useEffect(() => {
    const channel = supabase
      .channel('rush-config-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rush_time_slots',
      }, () => {
        loadRushStats();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rush_activities',
      }, () => {
        loadRushStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRushStats]);

  /**
   * 根据商家身份与场次类型计算个人可抢单数（与 getRushPhaseAndLimit 保持一致）
   *   - 早场(early)：体验商家 1 单；正式商家 2 单（系统自动）
   *   - 正式抢购(formal)：仅正式商家参与，推荐N人且被推荐人完成订单销售→N+1单，最多6单封顶
   *     rc 为"已完成订单销售的被推荐人数"
   */
  const computeDayLimit = (sessionType: 'early' | 'formal', rc: number) => {
    if (sessionType === 'early') {
      return mobileUser?.merchant_type === 'regular' ? incentiveCfg.regular : incentiveCfg.trial;
    }
    // rc=0：未推荐或推荐人无完成销售 → 主场0单；rc≥1：rc+1单，封顶6单
    return rc === 0 ? 0 : Math.min(rc + 1, 6);
  };

  /**
   * 计算当前场次与限额
   *
   * 时间依据（两层覆盖体系）：
   *   1. 自定义抢购活动（rush_activities，今日生效）：优先级最高，完全覆盖默认时段
   *   2. 默认时段（rush_time_slots）：仅工作日（周一～周五）生效
   * 命中任一时段：应用其 price_discount，库存按当天实际挂单商品数动态核算；未命中：phase='none' 或 'ended'
   *
   * 老板（is_super_admin=true）：完全绕过所有时段与限额检查。
   */
  const getRushPhaseAndLimit = async (userId: string) => {
    const bjNow   = new Date(getServerNow() + 8 * 3600000);
    const nowMins = bjNow.getUTCHours() * 60 + bjNow.getUTCMinutes();
    const bjTodayStart = new Date(
      Math.floor((getServerNow() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000
    ).toISOString();

    // ① 老板：完全绕过所有时段与限额检查
    if (mobileUser?.is_super_admin) {
      return { phase: 'boss' as const, dayLimit: 9999, todayCnt: 0, slot: null, sessionType: 'formal' as const, source: 'default' as const };
    }

    const [{ count: todayCnt }, { data: referredUsers }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId).gte('created_at', bjTodayStart),
      // 当前用户推荐的所有用户
      supabase.from('users').select('id')
        .eq('referrer_id', userId),
    ]);
    const referredIds = (referredUsers ?? []).map((u: { id: string }) => u.id);
    // 主场阶梯依据：被推荐人中"已完成订单销售"（作为买家有已完成订单）的人数
    let rc = 0;
    if (referredIds.length > 0) {
      const { data: completedBuyers } = await supabase.from('orders')
        .select('buyer_id')
        .in('buyer_id', referredIds)
        .eq('status', 'confirmed');
      const completedSet = new Set((completedBuyers ?? []).map((o: { buyer_id: string }) => o.buyer_id));
      rc = completedSet.size;
    }
    const tc = todayCnt ?? 0;

    // ② 自定义活动优先解析当前生效时段（覆盖默认）
    const current = resolveCurrentPeriod(nowMins);

    if (current) {
      // 全局库存核算：默认时段按 rush_slot_id，自定义活动按 rush_activity_id 统计
      const stockCol = current.source === 'custom' ? 'rush_activity_id' : 'rush_slot_id';
      const { count: sold } = await supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq(stockCol, current.id).gte('created_at', bjTodayStart);
      // 动态库存限额 = 当天实际挂单商品数（挂卖 + 转拍，已审核且在售）
      const { count: listed } = await supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('status', 'approved').eq('is_active', true);
      const slotRemaining = Math.max((listed ?? 0) - (sold ?? 0), 0);
      const dayLimit = computeDayLimit(current.session_type, rc);
      return { phase: 'slot' as const, dayLimit, todayCnt: tc, rc, slot: current, slotRemaining, sessionType: current.session_type, source: current.source };
    }

    // ③ 未命中任何时段：判断是"未到时间"还是"已结束"
    const anyEnded =
      todayActivities.some(a => nowMins >= a.end_minute) ||
      timeSlots.some(s => nowMins >= s.end_minute);
    // 周末且无自定义活动覆盖 → 不开放（默认时段仅工作日）
    const bjDow = bjNow.getUTCDay();
    const isWeekend = bjDow === 0 || bjDow === 6;
    if (anyEnded) {
      return { phase: 'ended' as const, dayLimit: 0, todayCnt: tc, slot: null, sessionType: 'formal' as const, source: 'default' as const };
    }
    if (isWeekend) {
      return { phase: 'none' as const, dayLimit: 0, todayCnt: tc, isWeekend: true, slot: null, sessionType: 'formal' as const, source: 'default' as const };
    }
    return { phase: 'none' as const, dayLimit: 0, todayCnt: tc, slot: null, sessionType: 'formal' as const, source: 'default' as const };
  };

  // 直接抢购预览商品（进货区）
  const handleFlashBuy = async (p: PreviewProduct) => {
    if (!mobileUser) { navigate('/m/login'); return; }
    if (!mobileUser.is_super_admin && mobileUser.kyc_status !== 'approved') { toast.error('请先完成实名认证'); navigate('/m/auth'); return; }
    // 早场预热阶段禁止下单（仅允许浏览，正式抢购时段开始后方可下单）
    if (rushPhase === 'warming') { toast.error('抢购尚未开始，请等待正式抢购时段开启'); return; }

    const result = await getRushPhaseAndLimit(mobileUser.id);
    const { phase, dayLimit, todayCnt, slot } = result;
    const slotRemaining = (result as { slotRemaining?: number }).slotRemaining ?? 0;

    if (phase === 'none') {
      const isWeekend = (result as { isWeekend?: boolean }).isWeekend;
      toast.error(isWeekend ? '抢购仅限工作日（周一至周五）开放' : '当前非抢购时段，请耐心等待');
      return;
    }
    if (phase === 'ended') {
      toast.error('今日抢购已结束');
      return;
    }
    // 时段模式：先校验全局库存（防止超配置限额），再校验单用户上限
    if (phase === 'slot') {
      if (slotRemaining <= 0) {
        toast.error('该时段库存已抢完');
        return;
      }
      if (dayLimit <= 0) {
        toast.error('当前抢单额度为 0，请先推荐好友并完成订单销售后再来抢购');
        return;
      }
      if (todayCnt >= dayLimit) {
        toast.error(`今日抢单已达上限（${dayLimit}单）`);
        return;
      }
    }
    // 老板无限制
    if (phase !== 'boss' && phase !== 'slot' && todayCnt >= dayLimit) {
      toast.error(dayLimit <= 0 ? '当前抢单额度为 0，请先完成推荐任务' : `今日抢单已达上限（${dayLimit}单）`);
      return;
    }

    // 应用时段价格折扣（slot 模式）
    const discount = slot?.price_discount ?? 1;
    const finalPrice = Math.round(p.consignment_price * discount * 100) / 100;

    // 早场所有商家均按点击商品直接购买（seller_id 从商品表取）
    let targetProductId = p.id;
    let targetSellerId  = mobileUser.id;
    const { data: prodData } = await supabase.from('products').select('seller_id').eq('id', p.id).maybeSingle();
    targetSellerId = prodData?.seller_id ?? mobileUser.id;

    setRushingProd(p.id);
    try {
      const { error } = await supabase.from('orders').insert({
        buyer_id:        mobileUser.id,
        seller_id:       targetSellerId,
        product_id:      targetProductId,
        amount:          finalPrice,
        status:          'pending_payment',
        order_no:        `ORD${Date.now()}`,
        is_rush:         true,
        rush_slot_id:    slot?.source === 'default' ? (slot?.id ?? null) : null,
        rush_activity_id: slot?.source === 'custom' ? (slot?.id ?? null) : null,
      });
      if (error) { toast.error('抢购失败，请重试'); return; }
      // 老人抢单成功后清除"未抢"标记
      if (mobileUser.merchant_type === 'regular') {
        await supabase.from('users').update({ rush_skipped_today: false }).eq('id', mobileUser.id);
      }
      setPurchasedIds(prev => new Set([...prev, p.id]));
      await supabase.from('products').update({ is_active: false }).eq('id', targetProductId);
      setSuccessModal({ show: true, title: p.title });
    } catch { toast.error('网络异常，请重试'); }
    finally { setRushingProd(null); }
  };

  // ── 基于时段配置计算当前状态（每秒随 now 刷新，实时生效）──
  const bjNow = new Date(getServerNow() + 8 * 3600000);
  const nowMins = bjNow.getUTCHours() * 60 + bjNow.getUTCMinutes();
  // 当前生效时段：自定义活动优先 > 默认时段
  const currentPeriod = resolveCurrentPeriod(nowMins);
  const bjDow = bjNow.getUTCDay();
  const isWeekend = bjDow === 0 || bjDow === 6;
  // 5 阶段状态机：精确推导当前用户所处交易阶段
  const rushPhase = computeRushPhase(currentPeriod, timeSlots, todayActivities, nowMins, isWeekend);
  // 无任何时段配置
  const noSlots = !loading && timeSlots.length === 0 && todayActivities.length === 0;
  // 下一次抢单（考虑工作日规则，周末顺延到下周一）—— 自定义活动与默认时段合并计算
  const nextRush = computeNextRush([...timeSlots, ...todayActivities]);
  // 早场预热时：找到下一个正式抢购时段的开始分钟（驱动 WarmingCountdown 倒计时）
  const allSlotsForPhase: NextRushSlot[] = [...timeSlots, ...todayActivities];
  const formalStartMinute: number | null = rushPhase === 'warming' && currentPeriod
    ? findFormalStart(allSlotsForPhase, currentPeriod.end_minute)
    : null;
  // 过滤掉已被抢完的商品（自己或他人已购、或商品已下架），确保只展示有效可购买商品
  const visibleProducts = previewProducts.filter(p => !purchasedIds.has(p.id) && p.is_active);

  // 阶段切换时按需刷新数据（幂等：prev===rushPhase 不重复触发，初始挂载由独立 effect 处理）
  const prevPhaseRef = useRef<RushPhase | null>(null);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = rushPhase;
    if (prev === null || prev === rushPhase) return; // 初始挂载或阶段未变，跳过
    // 进入预热：确保本期商品已加载
    if (rushPhase === 'warming') { load(); loadRushStats(); }
    // 进入正式抢购：刷新最新库存与订单状态
    if (rushPhase === 'trading') { load(); loadRushStats(); }
    // 进入已结束：更新今日成交统计
    if (rushPhase === 'ended') { loadRushStats(); }
  }, [rushPhase, load, loadRushStats]);

  // 【已禁用】自动抢单功能已关闭，正式商家需手动点击抢单按钮
  // 原自动触发逻辑（auto-rush-early）已移除，用户在抢购时段内手动操作即可
  return (
    <>
      <div className="min-h-screen bg-background pb-24">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

        {/* 顶栏 */}
        <div className="bg-card border-b border-border px-4 pt-2 pb-3 flex items-center justify-between">
          <MobileHeader title="限时抢单" back className="flex-1" />
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Flame size={13} className="text-orange-500" />
            <span>{
              rushPhase === 'trading' ? `${currentPeriod!.name} 抢购中` :
              rushPhase === 'warming' ? `${currentPeriod!.name} 预热中` :
              rushPhase === 'preview' ? '今日开市预览' :
              rushPhase === 'ended'   ? '今日已结束'    :
              `${timeSlots.length + todayActivities.length} 个时段`
            }</span>
          </div>
        </div>

        {/* ── 阶段提示区 ── */}
        {/* 早场预热：倒计时横幅（距正式抢购倒计时，精确到秒） */}
        {rushPhase === 'warming' && (
          <div className="px-4 pt-3">
            <WarmingCountdown targetMinute={formalStartMinute} />
          </div>
        )}
        {/* 正式抢购：规则说明横幅（按商家身份展示可抢单数与规则） */}
        {rushPhase === 'trading' && currentPeriod && mobileUser && !mobileUser.is_super_admin && referralCount !== null && (
          <RushRuleBanner
            merchantType={mobileUser.merchant_type as 'trial' | 'regular'}
            sessionType={currentPeriod.session_type}
            rc={referralCount ?? 0}
            dayLimit={computeDayLimit(currentPeriod.session_type, referralCount ?? 0)}
            used={todayOrderCount ?? 0}
            slotName={currentPeriod.name}
            source={currentPeriod.source}
          />
        )}

        {/* 库存数据不对外展示，用户仅可见商品信息与抢单按钮 */}

        {/* ── 正式商家今日抢购记录 ── */}
        {mobileUser?.merchant_type === 'regular' && (
          <div className="mx-4 mt-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <ListOrdered size={14} className="text-orange-500 shrink-0" />
              <span className="text-sm font-semibold text-foreground">今日抢购记录</span>
              <Badge className="bg-orange-500/10 text-orange-600 border-orange-200 text-[10px] px-1.5 py-0 ml-auto">
                {todayRushOrders.length} 单
              </Badge>
            </div>
            {todayRushOrders.length === 0 ? (
              <div className="px-4 py-4 flex items-center gap-2 text-muted-foreground">
                <Clock size={13} className="shrink-0" />
                <span className="text-xs">抢购开始后，您的抢单将在此展示，请耐心等待</span>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {todayRushOrders.map((order, idx) => {
                  const img = Array.isArray(order.products?.images) && (order.products?.images.length ?? 0) > 0
                    ? order.products!.images[0] : null;
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    pending_payment: { label: '待付款', cls: 'text-destructive' },
                    payment_uploaded: { label: '待确认', cls: 'text-primary' },
                    completed:        { label: '已完成', cls: 'text-green-600' },
                    cancelled:        { label: '已取消', cls: 'text-muted-foreground' },
                  };
                  const st = statusMap[order.status] ?? { label: order.status, cls: 'text-muted-foreground' };
                  return (
                    <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {img
                          ? <img src={img} alt={order.products?.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <Package size={16} className="text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{order.products?.title ?? '商品'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          卖家：{order.seller?.real_name ?? order.seller?.nickname ?? '—'}&nbsp;{order.seller?.phone ?? ''}
                        </p>
                        <p className="text-orange-500 font-bold text-xs">¥{Number(order.amount).toLocaleString()}</p>
                      </div>
                      <span className={`text-[10px] font-semibold shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-3 space-y-4">

          {/* ── 5 阶段内容区 ── */}
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : noSlots ? (
            <div className="text-center py-16 text-muted-foreground">
              <Zap size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无抢购时段</p>
            </div>

          ) : rushPhase === 'off' || rushPhase === 'ended' ? (
            /* 非交易日 / 今日已结束：展示下次抢单提醒 */
            <NextRushReminder nextRush={nextRush} />

          ) : rushPhase === 'preview' ? (
            /* ── 开市前预览（09:00～首场前）：只读商品列表 + 倒计时条 ── */
            <div className="space-y-4">
              <PreviewBanner nextRush={nextRush} />
              {visibleProducts.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Eye size={15} className="text-primary" />
                      <span className="text-sm font-semibold text-foreground">今日待售商品</span>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0 border">{visibleProducts.length}件</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">仅预览，开抢后方可下单</span>
                  </div>
                  <div className="columns-2 gap-3">
                    {visibleProducts.map(p => {
                      const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
                      return (
                        <div key={p.id} className="break-inside-avoid mb-3 bg-card border border-border rounded-xl overflow-hidden">
                          <div className="w-full aspect-[4/3] bg-muted overflow-hidden relative">
                            {img ? <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-muted-foreground" /></div>}
                            <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${p.is_resell ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                              {p.is_resell ? '转拍' : '寄卖'}
                            </span>
                          </div>
                          <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5">
                            <p className="text-xs text-foreground leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</p>
                            <p className="text-orange-500 font-bold text-sm">¥{p.consignment_price.toLocaleString()}</p>
                            <div className="w-full h-8 rounded-md bg-muted flex items-center justify-center gap-1">
                              <Clock size={11} className="text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">开抢后方可下单</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Package size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">正在准备本期商品</p>
                  <p className="text-xs mt-1">开市前将为您展示全部待售商品</p>
                </div>
              )}
            </div>

          ) : rushPhase === 'warming' ? (
            /* ── 早场预热（09:25～09:30）：只读商品 + 禁用按钮（WarmingCountdown 已在上方显示） ── */
            visibleProducts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">今日商品已抢完</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Eye size={15} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">本期抢购商品</span>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0 border">{visibleProducts.length}件</Badge>
                  </div>
                  <span className="text-xs text-orange-500 font-medium animate-pulse">即将开抢</span>
                </div>
                <div className="columns-2 gap-3">
                  {visibleProducts.map(p => {
                    const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
                    return (
                      <div key={p.id} className="break-inside-avoid mb-3 bg-card border border-border rounded-xl overflow-hidden">
                        <div className="w-full aspect-[4/3] bg-muted overflow-hidden relative">
                          {img ? <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-muted-foreground" /></div>}
                          <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${p.is_resell ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                            {p.is_resell ? '转拍' : '寄卖'}
                          </span>
                        </div>
                        <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5">
                          <p className="text-xs text-foreground leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</p>
                          <p className="text-orange-500 font-bold text-sm">¥{p.consignment_price.toLocaleString()}</p>
                          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" disabled onClick={() => {}}>
                            <Clock size={11} />即将开抢
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )

          ) : /* trading */ visibleProducts.length === 0 ? (
            /* ── 正式抢购 · 已抢完 ── */
            <div className="text-center py-16 text-muted-foreground">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">今日商品已抢完</p>
              <p className="text-xs mt-1">已售出的商品已自动移除</p>
            </div>
          ) : (
            /* ── 正式抢购（09:30～09:35）：可下单商品瀑布流 ── */
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={15} className="text-orange-500" />
                  <span className="text-sm font-semibold text-foreground">今日抢购商品</span>
                  <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0 border-0">{visibleProducts.length}件</Badge>
                </div>
                <span className="text-xs text-orange-500 font-medium animate-pulse">{currentPeriod!.name} 抢购中</span>
              </div>
              <div className="columns-2 gap-3">
                {visibleProducts.map(p => {
                  const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
                  const isRushingThis = rushingProd === p.id;
                  return (
                    <div key={p.id} className="break-inside-avoid mb-3 bg-card border border-border rounded-xl overflow-hidden">
                      <div className="w-full aspect-[4/3] bg-muted overflow-hidden relative cursor-pointer active:opacity-90" onClick={() => handleFlashBuy(p)}>
                        {img ? (
                          <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={28} className="text-muted-foreground" />
                          </div>
                        )}
                        <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${p.is_resell ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                          {p.is_resell ? '转拍' : '寄卖'}
                        </span>
                      </div>
                      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5">
                        <p className="text-xs text-foreground leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</p>
                        <p className="text-orange-500 font-bold text-sm">¥{p.consignment_price.toLocaleString()}</p>
                        <Button size="sm"
                          className="w-full h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white border-0 gap-1"
                          disabled={isRushingThis}
                          onClick={() => handleFlashBuy(p)}>
                          {isRushingThis
                            ? <><span className="animate-spin inline-block">⏳</span>抢购中…</>
                            : <><Zap size={11} />立即抢购</>}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* ── 购买成功弹窗 ── */}
      <AlertDialog open={successModal.show} onOpenChange={open => { if (!open) setSuccessModal({ show: false, title: '' }); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm rounded-2xl">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-1">
              <Rocket size={32} className="text-green-600" />
            </div>
            <AlertDialogTitle className="text-lg font-black text-foreground">🎉 抢购成功！</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground text-center">
              <span className="font-medium text-foreground line-clamp-1">{successModal.title}</span>
              <br />已加入买单仓库，请尽快上传付款凭证
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row gap-2 mt-1">
            <Button
              className="flex-1 bg-black hover:bg-black/80 text-white gap-1 border-0"
              onClick={() => { setSuccessModal({ show: false, title: '' }); navigate('/m/buy-warehouse?tab=pending_payment'); }}
            >
              <CheckCircle2 size={13} />去付款
            </Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600 text-white gap-1 border-0"
              onClick={() => setSuccessModal({ show: false, title: '' })}
            >
              <Zap size={13} />继续抢购
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 底部固定返回按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-2.5 bg-card/95 backdrop-blur border-t border-border z-30">
        <Button
          variant="outline"
          className="w-full h-11 text-base font-semibold gap-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} />返回上一页
        </Button>
      </div>
    </>
  );
}
