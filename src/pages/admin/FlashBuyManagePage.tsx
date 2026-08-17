// 进货市场·进货时段管理：配置进货/结束时间、查看今日进货数据
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Zap, Clock, RefreshCw, Save, Users, ShoppingBag, CheckCircle2,
  Play, StopCircle, TrendingUp, Package, Plus, Pencil, Trash2, Layers,
  CalendarPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── 配置键名（进货时间完全由 rush_time_slots 时段配置决定，此处仅保留非时间类参数）──
const TIME_KEYS = [
  'market_open_hour', 'market_open_minute',
  'rush_max_per_day',
  'resell_cutoff_hour', 'resell_cutoff_minute',
];

interface OrderRow {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  created_at: string;
  buyer?: { phone: string; nickname: string | null } | null;
  products?: { title: string } | null;
}

type BuyPhase = 'before' | 'active' | 'ended';

/** 自定义进货活动（覆盖默认时段） */
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
  created_at: string;
}

/** 进货时段配置 */
interface TimeSlot {
  id: string;
  name: string;
  start_minute: number;
  end_minute: number;
  price_discount: number;
  priority: number;
  is_active: boolean;
  session_type: 'early' | 'formal';
  created_at: string;
}

/** 分钟转 HH:MM */
function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
/** HH:MM 转分钟 */
function timeToMins(h: number, m: number): number {
  return h * 60 + m;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function formatCd(ms: number) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(pad2).join(':');
}

export default function FlashBuyManagePage() {
  // 配置值
  const [cfg, setCfg] = useState<Record<string, string>>({
    market_open_hour: '9', market_open_minute: '0',
    rush_max_per_day: '3',
    resell_cutoff_hour: '14', resell_cutoff_minute: '20',
  });
  const [saving, setSaving] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(true);

  // 今日进货订单
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // ── 进货时段配置（rush_time_slots）──
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimeSlot | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);
  // 时间重叠冲突（检测到与已有时段重叠时，等待用户确认）
  const [overlapConflicts, setOverlapConflicts] = useState<TimeSlot[] | null>(null);
  // 表单字段
  const [formName, setFormName] = useState('');
  const [formStartH, setFormStartH] = useState('9');
  const [formStartM, setFormStartM] = useState('29');
  const [formEndH, setFormEndH] = useState('9');
  const [formEndM, setFormEndM] = useState('30');
  const [formDiscount, setFormDiscount] = useState('1');
  const [formPriority, setFormPriority] = useState('1');
  const [formSessionType, setFormSessionType] = useState<'early' | 'formal'>('early');

  // ── 自定义活动管理 ──
  const [activities, setActivities] = useState<RushActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [actDialogOpen, setActDialogOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<RushActivity | null>(null);
  const [actDeleteTarget, setActDeleteTarget] = useState<RushActivity | null>(null);
  const [savingAct, setSavingAct] = useState(false);
  // 活动表单字段
  const [actName, setActName] = useState('');
  const [actDate, setActDate] = useState('');
  const [actStartH, setActStartH] = useState('9');
  const [actStartM, setActStartM] = useState('29');
  const [actEndH, setActEndH] = useState('9');
  const [actEndM, setActEndM] = useState('30');
  const [actDiscount, setActDiscount] = useState('1');
  const [actPriority, setActPriority] = useState('1');
  const [actSessionType, setActSessionType] = useState<'early' | 'formal'>('early');

  // 实时倒计时
  const [buyPhase, setBuyPhase] = useState<BuyPhase>('before');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 加载配置 ──
  const loadCfg = useCallback(async () => {
    setCfgLoading(true);
    const { data } = await supabase.from('system_settings').select('key,value').in('key', TIME_KEYS);
    if (data) {
      const m: Record<string, string> = {};
      data.forEach(r => { m[r.key] = r.value; });
      setCfg(prev => ({ ...prev, ...m }));
    }
    setCfgLoading(false);
  }, []);

  // ── 加载今日进货订单 ──
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('orders')
      .select('id,order_no,amount,status,created_at,buyer:users!buyer_id(phone,nickname),products!orders_product_id_fkey(title)')
      .gte('created_at', `${today}T00:00:00Z`)
      .order('created_at', { ascending: false });
    setOrders((data as unknown as OrderRow[]) ?? []);
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    loadCfg();
    loadOrders();
  }, [loadCfg, loadOrders]);

  // ── 加载时段配置 ──
  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    const { data } = await supabase
      .from('rush_time_slots')
      .select('id,name,start_minute,end_minute,price_discount,priority,is_active,session_type,created_at')
      .order('priority', { ascending: true });
    setSlots((data as unknown as TimeSlot[]) ?? []);
    setSlotsLoading(false);
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // ── 加载自定义活动 ──
  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    const { data } = await supabase
      .from('rush_activities')
      .select('id,name,activity_date,start_minute,end_minute,price_discount,priority,is_active,session_type,created_at')
      .order('activity_date', { ascending: false })
      .limit(100);
    setActivities((data as unknown as RushActivity[]) ?? []);
    setActivitiesLoading(false);
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // ── 活动新增/编辑 ──
  function openActCreate() {
    setEditingAct(null);
    setActName('');
    setActDate(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
    setActStartH('9'); setActStartM('29');
    setActEndH('9'); setActEndM('30');
    setActDiscount('1'); setActPriority('1');
    setActSessionType('early');
    setActDialogOpen(true);
  }
  function openActEdit(act: RushActivity) {
    setEditingAct(act);
    setActName(act.name);
    setActDate(act.activity_date);
    setActStartH(String(Math.floor(act.start_minute / 60)));
    setActStartM(String(act.start_minute % 60));
    setActEndH(String(Math.floor(act.end_minute / 60)));
    setActEndM(String(act.end_minute % 60));
    setActDiscount(String(act.price_discount));
    setActPriority(String(act.priority));
    setActSessionType(act.session_type ?? 'formal');
    setActDialogOpen(true);
  }

  async function handleSaveAct() {
    const name = actName.trim();
    if (!name) { toast.error('请输入活动名称'); return; }
    if (!actDate) { toast.error('请选择活动日期'); return; }
    const startMins = timeToMins(parseInt(actStartH) || 0, parseInt(actStartM) || 0);
    const endMins = timeToMins(parseInt(actEndH) || 0, parseInt(actEndM) || 0);
    if (endMins <= startMins) { toast.error('结束时间需晚于开始时间'); return; }
    const discount = parseFloat(actDiscount);
    const priority = parseInt(actPriority);
    if (isNaN(priority) || priority < 1) { toast.error('优先级需为正整数'); return; }
    setSavingAct(true);
    const payload = {
      name,
      activity_date: actDate,
      start_minute: startMins,
      end_minute: endMins,
      price_discount: discount,
      priority,
      session_type: actSessionType,
      updated_at: new Date().toISOString(),
    };
    const { error } = editingAct
      ? await supabase.from('rush_activities').update(payload).eq('id', editingAct.id)
      : await supabase.from('rush_activities').insert(payload);
    setSavingAct(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(editingAct ? '自定义活动已更新，实时生效' : '自定义活动已创建，实时生效');
    setActDialogOpen(false);
    loadActivities();
  }

  async function toggleAct(act: RushActivity) {
    const { error } = await supabase.from('rush_activities').update({ is_active: !act.is_active }).eq('id', act.id);
    if (error) { toast.error('操作失败：' + error.message); return; }
    toast.success(act.is_active ? '活动已禁用' : '活动已启用');
    loadActivities();
  }

  async function deleteAct() {
    if (!actDeleteTarget) return;
    const { error } = await supabase.from('rush_activities').delete().eq('id', actDeleteTarget.id);
    if (error) { toast.error('删除失败：' + error.message); return; }
    toast.success('自定义活动已删除');
    setActDeleteTarget(null);
    loadActivities();
  }

  // ── 打开新增/编辑对话框 ──
  function openCreate() {
    setEditingSlot(null);
    setFormName('');
    setFormStartH('9'); setFormStartM('29');
    setFormEndH('9'); setFormEndM('30');
    setFormDiscount('1'); setFormPriority('1');
    setFormSessionType('early');
    setDialogOpen(true);
  }
  function openEdit(slot: TimeSlot) {
    setEditingSlot(slot);
    setFormName(slot.name);
    setFormStartH(String(Math.floor(slot.start_minute / 60)));
    setFormStartM(String(slot.start_minute % 60));
    setFormEndH(String(Math.floor(slot.end_minute / 60)));
    setFormEndM(String(slot.end_minute % 60));
    setFormDiscount(String(slot.price_discount));
    setFormPriority(String(slot.priority));
    setFormSessionType(slot.session_type ?? 'formal');
    setDialogOpen(true);
  }

  // ── 实际写入数据库（新增/编辑）──
  async function commitSave() {
    setSavingSlot(true);
    const name = formName.trim();
    const startMins = timeToMins(parseInt(formStartH) || 0, parseInt(formStartM) || 0);
    const endMins = timeToMins(parseInt(formEndH) || 0, parseInt(formEndM) || 0);
    const discount = parseFloat(formDiscount);
    const priority = parseInt(formPriority);
    const payload = {
      name,
      start_minute: startMins,
      end_minute: endMins,
      price_discount: discount,
      priority,
      session_type: formSessionType,
      updated_at: new Date().toISOString(),
    };
    const { error } = editingSlot
      ? await supabase.from('rush_time_slots').update(payload).eq('id', editingSlot.id)
      : await supabase.from('rush_time_slots').insert(payload);
    setSavingSlot(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(editingSlot ? '时段已更新，实时生效' : '时段已创建，实时生效');
    setDialogOpen(false);
    setOverlapConflicts(null);
    loadSlots();
  }

  // ── 保存时段（先校验，再检测时间重叠，重叠时提示以本次配置为准）──
  function handleSaveSlot() {
    const name = formName.trim();
    if (!name) { toast.error('请填写时段名称'); return; }
    const startMins = timeToMins(parseInt(formStartH) || 0, parseInt(formStartM) || 0);
    const endMins = timeToMins(parseInt(formEndH) || 0, parseInt(formEndM) || 0);
    if (endMins <= startMins) { toast.error('结束时间必须晚于开始时间'); return; }
    const discount = parseFloat(formDiscount);
    if (isNaN(discount) || discount <= 0 || discount > 1) { toast.error('价格折扣需在 0~1 之间（如 0.9 表示9折）'); return; }
    const priority = parseInt(formPriority);
    if (isNaN(priority) || priority < 1) { toast.error('优先级需为正整数（数值越小越优先）'); return; }

    // 名称唯一性校验
    const dup = slots.find(s => s.name === name && s.id !== editingSlot?.id);
    if (dup) { toast.error('时段名称已存在'); return; }

    // 时间重叠检测：与已有时段（排除自身）存在区间重叠即提示
    const overlaps = slots.filter(s =>
      s.id !== editingSlot?.id && s.start_minute < endMins && s.end_minute > startMins
    );
    if (overlaps.length > 0) {
      setOverlapConflicts(overlaps);
      return;
    }
    commitSave();
  }

  // ── 启用/禁用时段 ──
  async function toggleSlot(slot: TimeSlot) {
    const { error } = await supabase
      .from('rush_time_slots')
      .update({ is_active: !slot.is_active, updated_at: new Date().toISOString() })
      .eq('id', slot.id);
    if (error) { toast.error('操作失败：' + error.message); return; }
    toast.success(slot.is_active ? '时段已禁用' : '时段已启用');
    loadSlots();
  }

  // ── 删除时段 ──
  async function handleDeleteSlot() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('rush_time_slots').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('删除失败：' + error.message); return; }
    toast.success('时段已删除');
    setDeleteTarget(null);
    loadSlots();
  }

  // ── 实时倒计时（默认时段仅工作日生效，周末显示休息状态）──
  useEffect(() => {
    function tick() {
      const now = Date.now();
      const bjNow = new Date(now + 8 * 3600000);
      const bjDow = bjNow.getUTCDay(); // 0=周日, 6=周六
      const isWeekend = bjDow === 0 || bjDow === 6;
      const nowMins = bjNow.getUTCHours() * 60 + bjNow.getUTCMinutes();
      const bjMidnightUtc = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;

      // 自定义活动优先（今日生效），覆盖默认时段，不受工作日限制
      const todayStr = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
      const customActive = activities.filter(a => a.is_active && a.activity_date === todayStr);
      const customMatch = customActive
        .filter(a => nowMins >= a.start_minute && nowMins < a.end_minute)
        .sort((a, b) => a.priority - b.priority)[0];

      if (customMatch) {
        setBuyPhase('active');
        setCountdown((bjMidnightUtc + customMatch.end_minute * 60000) - now);
        return;
      }

      // 默认时段仅工作日生效
      if (isWeekend) {
        setBuyPhase('ended');
        setCountdown(0);
        return;
      }

      // 时间依据：完全来自 rush_time_slots 时段配置（开始/结束分钟）
      const activeSlots = slots.filter(s => s.is_active).sort((a, b) => a.start_minute - b.start_minute);
      const matching = activeSlots.find(s => nowMins >= s.start_minute && nowMins < s.end_minute);
      const anyEnded = activeSlots.some(s => nowMins >= s.end_minute);
      const nextStart = activeSlots.find(s => s.start_minute > nowMins);
      if (matching) {
        setBuyPhase('active');
        setCountdown((bjMidnightUtc + matching.end_minute * 60000) - now);
      } else if (nextStart) {
        setBuyPhase('before');
        setCountdown((bjMidnightUtc + nextStart.start_minute * 60000) - now);
      } else if (anyEnded) {
        setBuyPhase('ended');
        setCountdown(0);
      } else {
        setBuyPhase('before');
        setCountdown(0);
      }
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slots, activities]);

  // ── 保存配置 ──
  async function handleSave() {
    setSaving(true);
    const upserts = TIME_KEYS.map(key => ({
      key,
      value: cfg[key] ?? '',
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('system_settings')
      .upsert(upserts, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('进货时段配置已保存，移动端实时生效');
  }

  function setField(key: string, val: string) {
    setCfg(prev => ({ ...prev, [key]: val }));
  }

  // ── 统计 ──
  const totalOrders    = orders.length;
  const completedOrders = orders.filter(o => ['confirmed', 'completed', 'payment_uploaded'].includes(o.status)).length;
  const pendingOrders  = orders.filter(o => o.status === 'pending_payment').length;
  const totalAmount    = orders.reduce((s, o) => s + Number(o.amount), 0);

  const phaseColor = buyPhase === 'active' ? 'text-orange-500' : buyPhase === 'ended' ? 'text-muted-foreground' : 'text-primary';
  const phaseLabel = buyPhase === 'active' ? '🔥 进货进行中' : buyPhase === 'before' ? '⏳ 待开始' : '✅ 已结束';

  const statusLabel: Record<string, string> = {
    pending_payment: '待付款', payment_uploaded: '已上传凭证',
    confirmed: '已确认', completed: '已完成', cancelled: '已取消',
  };
  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending_payment: 'secondary', payment_uploaded: 'default',
    confirmed: 'outline', completed: 'outline', cancelled: 'destructive',
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="进货市场·进货管理"
        description="设置每日进货开始/结束时间，实时监控今日进货进度与订单状态"
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { loadCfg(); loadOrders(); loadSlots(); loadActivities(); }}>
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      {/* ── 自定义进货活动管理（覆盖默认时段，优先级最高）── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarPlus size={16} className="text-primary shrink-0" />
                自定义进货活动
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                自定义活动生效后，其时间配置将完全覆盖对应时段的默认时间逻辑（优先级高于默认时段）
              </p>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={openActCreate}>
              <Plus size={14} />新建活动
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">活动名称</TableHead>
                  <TableHead className="whitespace-nowrap">日期</TableHead>
                  <TableHead className="whitespace-nowrap">场次</TableHead>
                  <TableHead className="whitespace-nowrap">时间</TableHead>
                  <TableHead className="whitespace-nowrap">折扣</TableHead>
                  <TableHead className="whitespace-nowrap">优先级</TableHead>
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                  <TableHead className="whitespace-nowrap text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activitiesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <CalendarPlus size={24} className="mx-auto mb-2 opacity-30" />
                      暂无自定义活动，默认时段生效中
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map(act => (
                    <TableRow key={act.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">{act.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{act.activity_date}</TableCell>
                      <TableCell>
                        <Badge variant={act.session_type === 'early' ? 'secondary' : 'default'} className="text-xs whitespace-nowrap">
                          {act.session_type === 'early' ? '🌅 早场' : '🔥 正式'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{minsToTime(act.start_minute)} - {minsToTime(act.end_minute)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{act.price_discount}x</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{act.priority}</TableCell>
                      <TableCell>
                        <Badge variant={act.is_active ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">
                          {act.is_active ? '启用' : '禁用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleAct(act)}>
                            {act.is_active ? '禁用' : '启用'}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openActEdit(act)}>
                            编辑
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setActDeleteTarget(act)}>
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 进货时段配置管理（多时段并行 + 优先级）── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers size={15} className="text-primary" />
            进货时段配置
            <Badge variant="secondary" className="ml-1 text-[10px]">{slots.filter(s => s.is_active).length} 个启用</Badge>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={openCreate}>
                  <Plus size={13} />新增时段
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingSlot ? '编辑进货时段' : '新增进货时段'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <div>
                    <Label className="text-xs text-muted-foreground">时段名称</Label>
                    <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="如：早场、主场、午场" className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">场次类型</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        variant={formSessionType === 'early' ? 'default' : 'outline'}
                        size="sm" className="h-9 flex-1"
                        onClick={() => setFormSessionType('early')}
                      >🌅 早场</Button>
                      <Button
                        type="button"
                        variant={formSessionType === 'formal' ? 'default' : 'outline'}
                        size="sm" className="h-9 flex-1"
                        onClick={() => setFormSessionType('formal')}
                      >🔥 正式进货</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      早场：体验商家可选抢2单 / 正式商家系统自动2单；正式进货：按推荐人数阶梯（1人→1单，最多3单）
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">开始时间</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="number" min={0} max={23} value={formStartH} onChange={e => setFormStartH(e.target.value)} className="h-9" />
                        <span className="text-muted-foreground">:</span>
                        <Input type="number" min={0} max={59} value={formStartM} onChange={e => setFormStartM(e.target.value)} className="h-9" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">结束时间</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="number" min={0} max={23} value={formEndH} onChange={e => setFormEndH(e.target.value)} className="h-9" />
                        <span className="text-muted-foreground">:</span>
                        <Input type="number" min={0} max={59} value={formEndM} onChange={e => setFormEndM(e.target.value)} className="h-9" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">价格折扣（0~1）</Label>
                      <Input type="number" min={0.01} max={1} step={0.01} value={formDiscount} onChange={e => setFormDiscount(e.target.value)} className="mt-1 h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">优先级（小优先）</Label>
                      <Input type="number" min={1} value={formPriority} onChange={e => setFormPriority(e.target.value)} className="mt-1 h-9" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    折扣示例：1=原价，0.9=9折。多个时段时间重叠时，按优先级数值最小者生效。库存限额由当天实际挂单商品数（挂卖+转拍）动态决定，无需配置。配置保存后实时生效，无需重启。
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                  <Button onClick={handleSaveSlot} disabled={savingSlot} className="gap-1.5">
                    {savingSlot ? <><RefreshCw size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">时段名称</TableHead>
                  <TableHead className="whitespace-nowrap">场次类型</TableHead>
                  <TableHead className="whitespace-nowrap">开始</TableHead>
                  <TableHead className="whitespace-nowrap">结束</TableHead>
                  <TableHead className="whitespace-nowrap">价格折扣</TableHead>
                  <TableHead className="whitespace-nowrap">优先级</TableHead>
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                  <TableHead className="whitespace-nowrap text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slotsLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : slots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <Layers size={22} className="mx-auto mb-2 opacity-30" />
                      暂无时段配置，点击「新增时段」创建
                    </TableCell>
                  </TableRow>
                ) : (
                  slots.map(slot => (
                    <TableRow key={slot.id}>
                      <TableCell className="whitespace-nowrap font-medium text-sm">{slot.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] ${slot.session_type === 'early' ? 'border-orange-300 text-orange-500' : 'border-primary/40 text-primary'}`}>
                          {slot.session_type === 'early' ? '早场' : '正式进货'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-mono">{minsToTime(slot.start_minute)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-mono">{minsToTime(slot.end_minute)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {Number(slot.price_discount) >= 1 ? '原价' : `${Math.round(Number(slot.price_discount) * 100)}%`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{slot.priority}</TableCell>
                      <TableCell>
                        <Badge variant={slot.is_active ? 'default' : 'secondary'} className="text-[10px] whitespace-nowrap">
                          {slot.is_active ? '启用' : '已禁用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleSlot(slot)}>
                            {slot.is_active ? <><StopCircle size={13} />禁用</> : <><Play size={13} />启用</>}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(slot)}>
                            <Pencil size={13} />编辑
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteTarget(slot)}>
                            <Trash2 size={13} />删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除时段「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后该时段立即失效，且无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSlot} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 时间重叠确认：以本次配置为准 */}
      <AlertDialog open={!!overlapConflicts} onOpenChange={open => { if (!open) setOverlapConflicts(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>检测到时段时间重叠</AlertDialogTitle>
            <AlertDialogDescription>
              该时段与以下已有时段存在时间重叠，以本次配置为准（本次保存的时段将优先生效）：
              <span className="block mt-2 font-medium text-foreground">
                {overlapConflicts?.map(s => `${s.name}（${minsToTime(s.start_minute)}–${minsToTime(s.end_minute)}）`).join('、')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={commitSave}>以本次配置为准，继续保存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 实时状态卡 ── */}
      <div className={`rounded-2xl border px-6 py-4 flex items-center gap-4 ${
        buyPhase === 'active'
          ? 'bg-orange-500/10 border-orange-300'
          : buyPhase === 'ended'
          ? 'bg-muted/40 border-border'
          : 'bg-primary/5 border-primary/30'
      }`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          buyPhase === 'active' ? 'bg-orange-500/20' : 'bg-primary/10'
        }`}>
          {buyPhase === 'active'
            ? <Zap size={22} className="text-orange-500" />
            : buyPhase === 'ended'
            ? <StopCircle size={22} className="text-muted-foreground" />
            : <Play size={22} className="text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${phaseColor}`}>{phaseLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {slots.filter(s => s.is_active).length > 0
              ? slots.filter(s => s.is_active).map(s => `${minsToTime(s.start_minute)}–${minsToTime(s.end_minute)}`).join('  ·  ')
              : '尚未配置进货时段'}
          </p>
        </div>
        {buyPhase !== 'ended' && (
          <div className={`shrink-0 rounded-xl px-4 py-2.5 text-center ${
            buyPhase === 'active' ? 'bg-orange-500 text-white' : 'bg-primary text-primary-foreground'
          }`}>
            <p className="text-xl font-bold font-mono leading-none tracking-widest">{formatCd(countdown)}</p>
            <p className="text-[10px] mt-1 opacity-80">{buyPhase === 'active' ? '距结束' : '距进货'}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── 时段配置 ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock size={15} className="text-primary" />
              时段参数配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {cfgLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
                {/* 开市时间 */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-2 block">开市时间（进货市场开放时间）</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-[11px] text-muted-foreground">时（0-23）</Label>
                      <Input type="number" min={0} max={23} value={cfg.market_open_hour}
                        onChange={e => setField('market_open_hour', e.target.value)} className="mt-1 h-9" />
                    </div>
                    <span className="text-muted-foreground mt-5">:</span>
                    <div className="flex-1">
                      <Label className="text-[11px] text-muted-foreground">分（0-59）</Label>
                      <Input type="number" min={0} max={59} value={cfg.market_open_minute}
                        onChange={e => setField('market_open_minute', e.target.value)} className="mt-1 h-9" />
                    </div>
                    <div className="mt-5 text-xs text-muted-foreground shrink-0">
                      → {pad2(parseInt(cfg.market_open_hour))}:{pad2(parseInt(cfg.market_open_minute))} 开市
                    </div>
                  </div>
                </div>

                {/* 📋 进货时间说明 */}
                <div className="border border-orange-200/60 rounded-lg p-3 bg-orange-500/5">
                  <Label className="text-xs font-semibold text-orange-600 mb-2 block">📋 进货时间配置</Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    进货的开始与结束时间已完全交由上方「时段参数配置」模块统一管理。
                    请在下方新增/编辑时段，设置各时段的开始分钟、结束分钟、库存限额与价格折扣，系统将严格按此执行。
                  </p>
                  {slots.filter(s => s.is_active).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {slots.filter(s => s.is_active).map(s => (
                        <span key={s.id} className="text-[10px] font-mono bg-card border border-border rounded px-1.5 py-0.5 text-foreground">
                          {s.name}：{minsToTime(s.start_minute)}–{minsToTime(s.end_minute)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 转拍截止 */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-2 block">转拍截止基准时间（前一天）</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-[11px] text-muted-foreground">时</Label>
                      <Input type="number" min={0} max={23} value={cfg.resell_cutoff_hour}
                        onChange={e => setField('resell_cutoff_hour', e.target.value)} className="mt-1 h-9" />
                    </div>
                    <span className="text-muted-foreground mt-5">:</span>
                    <div className="flex-1">
                      <Label className="text-[11px] text-muted-foreground">分</Label>
                      <Input type="number" min={0} max={59} value={cfg.resell_cutoff_minute}
                        onChange={e => setField('resell_cutoff_minute', e.target.value)} className="mt-1 h-9" />
                    </div>
                    <div className="mt-5 text-xs text-muted-foreground shrink-0">
                      → 前日 {pad2(parseInt(cfg.resell_cutoff_hour))}:{pad2(parseInt(cfg.resell_cutoff_minute))} 截止
                    </div>
                  </div>
                </div>

                {/* 时间线预览 */}
                <div className="bg-muted/50 rounded-xl p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-foreground mb-2">今日时间线预览</p>
                  {[
                    { label: '进货市场开市', time: `${pad2(parseInt(cfg.market_open_hour))}:${pad2(parseInt(cfg.market_open_minute))}`, color: 'text-primary' },
                    ...slots.filter(s => s.is_active).sort((a, b) => a.start_minute - b.start_minute).map(s => ({
                      label: `${s.name}（${minsToTime(s.start_minute)}–${minsToTime(s.end_minute)}）`,
                      time: minsToTime(s.start_minute),
                      color: 'text-orange-500',
                    })),
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground w-12 shrink-0">{item.time}</span>
                      <div className="flex-1 h-px bg-border" />
                      <span className={`${item.color} font-medium`}>{item.label}</span>
                    </div>
                  ))}
                </div>


                <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                  {saving ? <><RefreshCw size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存配置</>}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── 今日数据统计 ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag size={14} className="text-primary" />
                  <span className="text-xs text-muted-foreground">今日订单</span>
                </div>
                <p className="text-2xl font-bold">{ordersLoading ? '—' : totalOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-xs text-muted-foreground">已完成</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{ordersLoading ? '—' : completedOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-orange-500" />
                  <span className="text-xs text-muted-foreground">待付款</span>
                </div>
                <p className="text-2xl font-bold text-orange-500">{ordersLoading ? '—' : pendingOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-primary" />
                  <span className="text-xs text-muted-foreground">交易额</span>
                </div>
                <p className="text-lg font-bold">¥{ordersLoading ? '—' : totalAmount.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* 今日订单列表 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users size={14} className="text-primary" />
                今日进货订单
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={loadOrders}>
                  <RefreshCw size={11} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">买家</TableHead>
                      <TableHead className="whitespace-nowrap">商品</TableHead>
                      <TableHead className="whitespace-nowrap">金额</TableHead>
                      <TableHead className="whitespace-nowrap">状态</TableHead>
                      <TableHead className="whitespace-nowrap">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          <Package size={24} className="mx-auto mb-2 opacity-30" />
                          今日暂无订单
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {o.buyer?.phone?.slice(-4)
                              ? `****${o.buyer.phone.slice(-4)}`
                              : o.buyer?.nickname ?? '—'}
                          </TableCell>
                          <TableCell className="max-w-[100px]">
                            <p className="text-xs truncate">{o.products?.title ?? '—'}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs font-medium">
                            ¥{Number(o.amount).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[o.status] ?? 'secondary'} className="text-xs whitespace-nowrap">
                              {statusLabel[o.status] ?? o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 自定义活动 新增/编辑 对话框 ── */}
      <Dialog open={actDialogOpen} onOpenChange={setActDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAct ? '编辑自定义活动' : '新建自定义活动'}</DialogTitle>
            <DialogDescription>
              自定义活动生效后，其时间配置将完全覆盖对应时段的默认时间逻辑。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">活动名称</label>
              <Input value={actName} onChange={e => setActName(e.target.value)} placeholder="如：周末特惠进货" className="px-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">活动日期</label>
              <Input type="date" value={actDate} onChange={e => setActDate(e.target.value)} className="px-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">场次类型</label>
              <div className="flex gap-2">
                <Button size="sm" variant={actSessionType === 'early' ? 'default' : 'outline'} className="flex-1" onClick={() => setActSessionType('early')}>🌅 早场</Button>
                <Button size="sm" variant={actSessionType === 'formal' ? 'default' : 'outline'} className="flex-1" onClick={() => setActSessionType('formal')}>🔥 正式进货</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">开始时间</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input type="number" min={0} max={23} value={actStartH} onChange={e => setActStartH(e.target.value)} className="h-9" />
                  <span className="text-muted-foreground">:</span>
                  <Input type="number" min={0} max={59} value={actStartM} onChange={e => setActStartM(e.target.value)} className="h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">结束时间</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input type="number" min={0} max={23} value={actEndH} onChange={e => setActEndH(e.target.value)} className="h-9" />
                  <span className="text-muted-foreground">:</span>
                  <Input type="number" min={0} max={59} value={actEndM} onChange={e => setActEndM(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">价格折扣</label>
                <Input type="number" value={actDiscount} onChange={e => setActDiscount(e.target.value)} step={0.01} min={0.01} className="px-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">优先级</label>
                <Input type="number" value={actPriority} onChange={e => setActPriority(e.target.value)} min={1} className="px-2" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              库存限额由当天实际挂单商品数（挂卖+转拍）动态决定，无需配置。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAct} disabled={savingAct}>
              {savingAct ? <><RefreshCw size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除自定义活动确认 ── */}
      <AlertDialog open={!!actDeleteTarget} onOpenChange={o => { if (!o) setActDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>删除自定义活动？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除活动「{actDeleteTarget?.name}」，删除后该时段恢复默认时间逻辑。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
