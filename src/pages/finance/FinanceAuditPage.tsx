// 财务审核管理中心
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  CheckCircle, XCircle, Clock, Eye, Download, RefreshCw,
  AlertTriangle, Shield, TrendingUp, Wallet, BarChart3,
  Filter, Search, ChevronRight, Loader2, CreditCard,
  FileText, Zap, Target, Users, ArrowUpRight, Banknote,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import type { WithdrawalRequest } from '@/types/types';

// ─── 类型 ───────────────────────────────────────────
interface ExtWithdrawal extends WithdrawalRequest {
  risk_level: 'normal' | 'medium' | 'high';
  review_stage: string;
  review_notes?: string;
  reviewer_name?: string;
}

interface ReviewLog {
  id: string;
  withdrawal_id: string;
  reviewer_name?: string;
  action: string;
  stage: string;
  comment?: string;
  amount?: number;
  created_at: string;
}

interface RiskRule {
  id: string;
  rule_key: string;
  rule_name: string;
  threshold: number;
  is_active: boolean;
  description: string;
}

// ─── 常量 ───────────────────────────────────────────
const PAGE_SIZE = 20;

const ACCT_LABEL: Record<string, string> = {
  points: '代金券账户', promotion: '推广奖金账户', balance: '余额账户',
};

const RISK_CONFIG = {
  normal: { label: '正常', color: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: '中风险', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  high:   { label: '高风险', color: 'bg-red-100 text-red-700 border-red-200' },
};

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  pending:            { label: '待初审', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  initial_review:     { label: '初审中', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  secondary_review:   { label: '复审中', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  final_approval:     { label: '终审中', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  completed:          { label: '审核完成', color: 'bg-green-100 text-green-700 border-green-200' },
  rejected:           { label: '已拒绝', color: 'bg-red-100 text-red-700 border-red-200' },
};

const ACTION_LABELS: Record<string, string> = {
  submit: '提交申请', initial_approve: '初审通过', initial_reject: '初审拒绝',
  secondary_approve: '复审通过', secondary_reject: '复审拒绝',
  final_approve: '终审批准', final_reject: '终审拒绝',
  mark_paid: '标记到账', note_added: '添加备注',
};

function maskAccount(s?: string) {
  if (!s) return '-';
  if (s.length <= 8) return s.replace(/./g, '*');
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

// ─── 风险徽章 ───────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_CONFIG[level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.normal;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
      {level !== 'normal' && <AlertTriangle size={9} />}{cfg.label}
    </span>
  );
}

// ─── 审核阶段徽章 ────────────────────────────────────
function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.pending;
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── KPI卡片 ─────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-sm p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className="w-9 h-9 rounded-sm bg-muted flex items-center justify-center shrink-0">
        <Icon size={16} className={color} />
      </div>
    </div>
  );
}

// ─── 主页面 ─────────────────────────────────────────
export default function FinanceAuditPage() {
  // 工作台状态
  const [workItems,     setWorkItems]     = useState<ExtWithdrawal[]>([]);
  const [workTotal,     setWorkTotal]     = useState(0);
  const [workPage,      setWorkPage]      = useState(1);
  const [workLoading,   setWorkLoading]   = useState(false);
  const [checkedIds,    setCheckedIds]    = useState<Set<string>>(new Set());

  // 全部提现
  const [allItems,      setAllItems]      = useState<ExtWithdrawal[]>([]);
  const [allTotal,      setAllTotal]      = useState(0);
  const [allPage,       setAllPage]       = useState(1);
  const [allLoading,    setAllLoading]    = useState(false);
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [acctFilter,    setAcctFilter]    = useState('all');
  const [riskFilter,    setRiskFilter]    = useState('all');
  const [searchQ,       setSearchQ]       = useState('');

  // 统计
  const [stats,         setStats]         = useState<{
    pending: number; today_approved: number; month_amount: number; approval_rate: number;
    avg_hours: number; chart_data: { name: string; count: number; amount: number }[];
  } | null>(null);

  // 风险预警
  const [riskItems,     setRiskItems]     = useState<ExtWithdrawal[]>([]);
  const [riskRules,     setRiskRules]     = useState<RiskRule[]>([]);
  const [riskLoading,   setRiskLoading]   = useState(false);

  // 弹窗
  const [detailItem,   setDetailItem]    = useState<ExtWithdrawal | null>(null);
  const [reviewLogs,   setReviewLogs]    = useState<ReviewLog[]>([]);
  const [reviewOpen,   setReviewOpen]    = useState(false);
  const [reviewTarget, setReviewTarget]  = useState<ExtWithdrawal | null>(null);
  const [reviewAction, setReviewAction]  = useState<'approve' | 'reject' | 'paid'>('approve');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [batchDialog,  setBatchDialog]   = useState<'approve' | 'reject' | null>(null);
  const [batchLoading, setBatchLoading]  = useState(false);

  // ── 加载工作台（待审核） ──
  const fetchWork = useCallback(async () => {
    setWorkLoading(true);
    const from = (workPage - 1) * PAGE_SIZE;
    const { data, count } = await supabase
      .from('withdrawal_requests')
      .select('*, user:user_id(phone,nickname)', { count: 'exact' })
      .in('status', ['pending'])
      .order('risk_level', { ascending: false }) // high first
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    setWorkItems((data as ExtWithdrawal[]) ?? []);
    setWorkTotal(count ?? 0);
    setWorkLoading(false);
    setCheckedIds(new Set());
  }, [workPage]);

  // ── 加载全部提现 ──
  const fetchAll = useCallback(async () => {
    setAllLoading(true);
    const from = (allPage - 1) * PAGE_SIZE;
    let q = supabase
      .from('withdrawal_requests')
      .select('*, user:user_id(phone,nickname)', { count: 'exact' });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (acctFilter  !== 'all') q = q.eq('account_type', acctFilter);
    if (riskFilter  !== 'all') q = q.eq('risk_level', riskFilter);
    if (searchQ.trim())         q = q.or(`bank_account.ilike.%${searchQ}%,bank_holder.ilike.%${searchQ}%`);
    const { data, count } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setAllItems((data as ExtWithdrawal[]) ?? []);
    setAllTotal(count ?? 0);
    setAllLoading(false);
  }, [allPage, statusFilter, acctFilter, riskFilter, searchQ]);

  // ── 加载统计 ──
  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from('withdrawal_requests').select('status, amount, created_at, reviewed_at, account_type');
    if (!data) return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const pending = data.filter(r => r.status === 'pending').length;
    const today_approved = data.filter(r => r.status === 'approved' && r.created_at?.startsWith(todayStr)).length;
    const month_amount = data
      .filter(r => r.status === 'approved' && r.created_at >= monthStart)
      .reduce((s, r) => s + Number(r.amount), 0);
    const total = data.length;
    const approved = data.filter(r => ['approved', 'paid'].includes(r.status)).length;
    const approval_rate = total > 0 ? Math.round((approved / total) * 100) : 0;

    // 平均审核时长（小时）
    const reviewed = data.filter(r => r.reviewed_at && r.created_at);
    const avg_hours = reviewed.length > 0
      ? reviewed.reduce((s, r) => {
          const diff = new Date(r.reviewed_at).getTime() - new Date(r.created_at).getTime();
          return s + diff / 3600000;
        }, 0) / reviewed.length
      : 0;

    // 近7天每日数量
    const chart_data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayItems = data.filter(r => r.created_at?.startsWith(ds));
      return {
        name: `${d.getMonth() + 1}/${d.getDate()}`,
        count: dayItems.length,
        amount: dayItems.reduce((s, r) => s + Number(r.amount), 0),
      };
    });

    setStats({ pending, today_approved, month_amount, approval_rate, avg_hours, chart_data });
  }, []);

  // ── 加载风险预警 ──
  const fetchRisk = useCallback(async () => {
    setRiskLoading(true);
    const [riskRes, rulesRes] = await Promise.all([
      supabase.from('withdrawal_requests')
        .select('*, user:user_id(phone,nickname)')
        .in('risk_level', ['medium', 'high'])
        .eq('status', 'pending')
        .order('risk_level', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('finance_risk_rules').select('*').order('rule_key'),
    ]);
    setRiskItems((riskRes.data as ExtWithdrawal[]) ?? []);
    setRiskRules((rulesRes.data as RiskRule[]) ?? []);
    setRiskLoading(false);
  }, []);

  useEffect(() => { fetchWork(); }, [fetchWork]);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchStats(); fetchRisk(); }, [fetchStats, fetchRisk]);

  // ── 加载审核日志 ──
  async function fetchLogs(withdrawalId: string) {
    const { data } = await supabase
      .from('withdrawal_review_logs')
      .select('*')
      .eq('withdrawal_id', withdrawalId)
      .order('created_at', { ascending: true });
    setReviewLogs((data as ReviewLog[]) ?? []);
  }

  // ── 打开审核弹窗 ──
  function openReview(item: ExtWithdrawal, action: 'approve' | 'reject' | 'paid') {
    setReviewTarget(item);
    setReviewAction(action);
    setReviewComment('');
    setReviewOpen(true);
  }

  // ── 执行审核操作 ──
  async function submitReview() {
    if (!reviewTarget) return;
    setReviewLoading(true);
    const now = new Date().toISOString();

    let newStatus = reviewTarget.status;
    let newStage  = reviewTarget.review_stage;
    let logAction = '';

    if (reviewAction === 'approve') {
      if (newStage === 'pending' || newStage === '') { newStage = 'completed'; newStatus = 'approved'; logAction = 'final_approve'; }
      else { newStage = 'completed'; newStatus = 'approved'; logAction = 'final_approve'; }
    } else if (reviewAction === 'reject') {
      newStage = 'rejected'; newStatus = 'rejected'; logAction = 'final_reject';
    } else if (reviewAction === 'paid') {
      newStage = 'completed'; newStatus = 'paid'; logAction = 'mark_paid';
    }

    const updatePayload: Record<string, unknown> = {
      status: newStatus, review_stage: newStage, reviewed_at: now,
    };
    if (reviewAction === 'reject') updatePayload.reject_reason = reviewComment || '不符合提现条件';
    if (reviewComment) updatePayload.review_notes = reviewComment;
    if (reviewAction === 'paid') updatePayload.paid_at = now;

    const { error } = await supabase.from('withdrawal_requests').update(updatePayload).eq('id', reviewTarget.id);
    if (error) { toast.error('操作失败：' + error.message); setReviewLoading(false); return; }

    // 写入审核日志
    await supabase.from('withdrawal_review_logs').insert({
      withdrawal_id: reviewTarget.id,
      action: logAction,
      stage: newStage,
      comment: reviewComment || null,
      amount: reviewTarget.amount,
    });

    setReviewLoading(false);
    setReviewOpen(false);
    const msgs: Record<string, string> = { approve: '已批准提现申请', reject: '已拒绝提现申请', paid: '已标记到账' };
    toast.success(msgs[reviewAction]);
    fetchWork(); fetchAll(); fetchStats();
  }

  // ── 批量审核 ──
  async function executeBatch(action: 'approve' | 'reject') {
    if (!checkedIds.size) return;
    setBatchLoading(true);
    const ids = Array.from(checkedIds);
    const now = new Date().toISOString();
    if (action === 'approve') {
      await supabase.from('withdrawal_requests')
        .update({ status: 'approved', review_stage: 'completed', reviewed_at: now })
        .in('id', ids);
      toast.success(`已批准 ${ids.length} 笔提现申请`);
    } else {
      await supabase.from('withdrawal_requests')
        .update({ status: 'rejected', review_stage: 'rejected', reject_reason: '批量审核拒绝', reviewed_at: now })
        .in('id', ids);
      toast.success(`已拒绝 ${ids.length} 笔提现申请`);
    }
    // 批量写日志
    await supabase.from('withdrawal_review_logs').insert(
      ids.map(id => ({ withdrawal_id: id, action: action === 'approve' ? 'final_approve' : 'final_reject', stage: action === 'approve' ? 'completed' : 'rejected' }))
    );
    setBatchLoading(false);
    setBatchDialog(null);
    setCheckedIds(new Set());
    fetchWork(); fetchAll(); fetchStats();
  }

  // ── 导出 Excel ──
  async function handleExport() {
    toast.info('正在导出...');
    let q = supabase.from('withdrawal_requests').select('*, user:user_id(phone,nickname)');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q.order('created_at', { ascending: false });
    if (!data?.length) { toast.error('无数据可导出'); return; }
    const rows = data.map((r: any) => ({
      '申请ID': r.id,
      '用户手机': r.user?.phone ?? '-',
      '用户昵称': r.user?.nickname ?? '-',
      '账户类型': ACCT_LABEL[r.account_type] ?? r.account_type,
      '提现金额': r.amount,
      '银行名称': r.bank_name ?? '-',
      '收款账号': r.bank_account ?? '-',
      '持卡人': r.bank_holder ?? '-',
      '状态': r.status,
      '审核阶段': r.review_stage ?? '-',
      '风险等级': r.risk_level ?? 'normal',
      '驳回原因': r.reject_reason ?? '',
      '审核备注': r.review_notes ?? '',
      '申请时间': new Date(r.created_at).toLocaleString('zh-CN'),
      '审核时间': r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('zh-CN') : '-',
      '到账时间': r.paid_at ? new Date(r.paid_at).toLocaleString('zh-CN') : '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '提现记录');
    XLSX.writeFile(wb, `提现审核记录_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`);
    toast.success('导出成功');
  }

  // ── 更新风险规则阈值 ──
  async function saveRuleThreshold(rule: RiskRule, newVal: number) {
    await supabase.from('finance_risk_rules').update({ threshold: newVal, updated_at: new Date().toISOString() }).eq('id', rule.id);
    setRiskRules(prev => prev.map(r => r.id === rule.id ? { ...r, threshold: newVal } : r));
    toast.success('规则已更新');
  }

  async function toggleRule(rule: RiskRule) {
    await supabase.from('finance_risk_rules').update({ is_active: !rule.is_active }).eq('id', rule.id);
    setRiskRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  }

  // ── 多选 ──
  const allChecked = workItems.length > 0 && workItems.every(i => checkedIds.has(i.id));
  function toggleAll() { setCheckedIds(allChecked ? new Set() : new Set(workItems.map(i => i.id))); }
  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const workTotalPages = Math.ceil(workTotal / PAGE_SIZE);
  const allTotalPages  = Math.ceil(allTotal / PAGE_SIZE);

  // ─── 工作台表格行 ────────────────────────────────────
  function WorkRow({ item, i }: { item: ExtWithdrawal; i: number }) {
    return (
      <tr className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${checkedIds.has(item.id) ? 'bg-primary/5' : i % 2 === 1 ? 'bg-muted/10' : ''}`}>
        <td className="px-3 py-2.5">
          <Checkbox checked={checkedIds.has(item.id)} onCheckedChange={() => toggleCheck(item.id)} className="w-3.5 h-3.5" />
        </td>
        <td className="px-3 py-2.5 text-xs">
          <p className="font-mono font-medium">{(item.user as any)?.phone ?? '-'}</p>
          <p className="text-muted-foreground text-[10px]">{(item.user as any)?.nickname ?? ''}</p>
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{ACCT_LABEL[item.account_type] ?? item.account_type}</td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-bold text-primary">¥{Number(item.amount).toFixed(2)}</td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground font-mono">{maskAccount(item.bank_account)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap"><RiskBadge level={item.risk_level ?? 'normal'} /></td>
        <td className="px-3 py-2.5 whitespace-nowrap"><StageBadge stage={item.review_stage ?? 'pending'} /></td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
          {new Date(item.created_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { setDetailItem(item); fetchLogs(item.id); }}
              className="h-6 w-6 p-0 border border-border" title="详情">
              <Eye size={11} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openReview(item, 'approve')}
              className="h-6 px-2 text-xs border border-green-300 text-green-700 hover:bg-green-50 gap-0.5">
              <CheckCircle size={10} />批准
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openReview(item, 'reject')}
              className="h-6 px-2 text-xs border border-destructive/30 text-destructive hover:bg-destructive/5 gap-0.5">
              <XCircle size={10} />拒绝
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="财务审核中心"
        description="提现申请全流程管理、审核工作台与财务统计"
        action={
          <Button size="sm" variant="ghost" onClick={handleExport}
            className="h-8 gap-1.5 text-xs border border-border">
            <Download size={13} />导出报表
          </Button>
        }
      />

      <Tabs defaultValue="workbench" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="workbench" className="text-xs gap-1.5">
            <Zap size={12} />审核工作台
            {workTotal > 0 && <Badge className="h-4 px-1.5 text-[9px] ml-0.5">{workTotal}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="records" className="text-xs gap-1.5">
            <FileText size={12} />提现记录
          </TabsTrigger>
          <TabsTrigger value="statistics" className="text-xs gap-1.5">
            <BarChart3 size={12} />财务统计
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1.5">
            <Shield size={12} />风险预警
            {riskItems.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[9px] ml-0.5">{riskItems.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════ 审核工作台 ══════════════════ */}
        <TabsContent value="workbench" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              待处理申请 <span className="text-primary font-semibold">{workTotal}</span> 笔，风险申请优先展示
            </p>
            <Button variant="ghost" size="sm" onClick={fetchWork} className="h-7 w-7 p-0 border border-border">
              <RefreshCw size={12} />
            </Button>
          </div>

          {/* 批量操作栏 */}
          {checkedIds.size > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-sm text-xs">
              <span className="text-primary font-medium">已选 {checkedIds.size} 笔</span>
              <div className="flex gap-1.5 ml-auto">
                <Button size="sm" variant="ghost" onClick={() => setBatchDialog('approve')}
                  className="h-7 px-2.5 text-xs border border-green-300 text-green-700 hover:bg-green-50">
                  <CheckCircle size={11} className="mr-1" />批量批准
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBatchDialog('reject')}
                  className="h-7 px-2.5 text-xs border border-destructive/30 text-destructive hover:bg-destructive/5">
                  <XCircle size={11} className="mr-1" />批量拒绝
                </Button>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2.5 w-8">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="w-3.5 h-3.5" />
                  </th>
                  {['申请用户','账户类型','提现金额','收款账号','风险等级','审核阶段','申请时间','操作'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workLoading ? (
                  <tr><td colSpan={9} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />加载中...
                    </div>
                  </td></tr>
                ) : workItems.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-xs text-muted-foreground">
                    <CheckCircle size={28} className="mx-auto mb-2 text-green-500 opacity-60" />
                    暂无待审核提现申请
                  </td></tr>
                ) : workItems.map((item, i) => <WorkRow key={item.id} item={item} i={i} />)}
              </tbody>
            </table>
          </div>

          {workTotalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {workTotal} 笔，第 {workPage}/{workTotalPages} 页</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setWorkPage(p => Math.max(1, p - 1))} disabled={workPage === 1}
                  className="h-7 px-3 text-xs border border-border">上一页</Button>
                <Button variant="ghost" size="sm" onClick={() => setWorkPage(p => Math.min(workTotalPages, p + 1))} disabled={workPage === workTotalPages}
                  className="h-7 px-3 text-xs border border-border">下一页</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════ 提现记录 ══════════════════ */}
        <TabsContent value="records" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-40">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={searchQ} onChange={e => { setSearchQ(e.target.value); setAllPage(1); }}
                placeholder="搜索收款账号/持卡人" className="h-8 text-xs bg-muted border-border pl-7" />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setAllPage(1); }}>
              <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border">
                <Filter size={11} className="mr-1 shrink-0 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">待审核</SelectItem>
                <SelectItem value="approved">已批准</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
                <SelectItem value="paid">已到账</SelectItem>
              </SelectContent>
            </Select>
            <Select value={acctFilter} onValueChange={v => { setAcctFilter(v); setAllPage(1); }}>
              <SelectTrigger className="w-32 h-8 text-xs bg-muted border-border"><SelectValue placeholder="全部账户" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部账户</SelectItem>
                <SelectItem value="points">代金券账户</SelectItem>
                <SelectItem value="promotion">推广奖金</SelectItem>
                <SelectItem value="balance">余额账户</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={v => { setRiskFilter(v); setAllPage(1); }}>
              <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border"><SelectValue placeholder="全部风险" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部风险</SelectItem>
                <SelectItem value="high">高风险</SelectItem>
                <SelectItem value="medium">中风险</SelectItem>
                <SelectItem value="normal">正常</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['申请用户','账户类型','提现金额','收款账号','持卡人','风险','状态','申请时间','审核时间','操作'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allLoading ? (
                  <tr><td colSpan={10} className="py-10 text-center text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin inline mr-1" />加载中...</td></tr>
                ) : allItems.length === 0 ? (
                  <tr><td colSpan={10} className="py-12 text-center text-xs text-muted-foreground">暂无数据</td></tr>
                ) : allItems.map((item, i) => (
                  <tr key={item.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2.5 text-xs">
                      <p className="font-mono">{(item.user as any)?.phone ?? '-'}</p>
                      <p className="text-[10px] text-muted-foreground">{(item.user as any)?.nickname ?? ''}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{ACCT_LABEL[item.account_type] ?? item.account_type}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-bold text-primary">¥{Number(item.amount).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">{maskAccount(item.bank_account)}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{item.bank_holder ?? '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><RiskBadge level={item.risk_level ?? 'normal'} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      {item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setDetailItem(item); fetchLogs(item.id); }}
                          className="h-6 w-6 p-0 border border-border">
                          <Eye size={11} />
                        </Button>
                        {item.status === 'approved' && (
                          <Button variant="ghost" size="sm" onClick={() => openReview(item, 'paid')}
                            className="h-6 px-2 text-xs border border-blue-300 text-blue-700 hover:bg-blue-50 gap-0.5">
                            <Banknote size={10} />到账
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allTotalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {allTotal} 条，第 {allPage}/{allTotalPages} 页</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAllPage(p => Math.max(1, p - 1))} disabled={allPage === 1}
                  className="h-7 px-3 text-xs border border-border">上一页</Button>
                <Button variant="ghost" size="sm" onClick={() => setAllPage(p => Math.min(allTotalPages, p + 1))} disabled={allPage === allTotalPages}
                  className="h-7 px-3 text-xs border border-border">下一页</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════ 财务统计 ══════════════════ */}
        <TabsContent value="statistics" className="space-y-5">
          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="待审核申请" value={stats ? String(stats.pending) : '-'} sub="笔待处理" icon={Clock} color="text-orange-500" />
            <KpiCard title="今日已批准" value={stats ? String(stats.today_approved) : '-'} sub="笔" icon={CheckCircle} color="text-green-600" />
            <KpiCard title="本月提现总额" value={stats ? `¥${stats.month_amount.toFixed(0)}` : '-'} sub="已批准金额" icon={Wallet} color="text-primary" />
            <KpiCard title="审核通过率" value={stats ? `${stats.approval_rate}%` : '-'} sub="历史总计" icon={Target} color="text-blue-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 近7天提现数量 */}
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={14} className="text-primary" />
                <h3 className="text-sm font-semibold">近7天提现申请量</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats?.chart_data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" name="申请数" fill="hsl(var(--primary))" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 近7天提现金额 */}
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-primary" />
                <h3 className="text-sm font-semibold">近7天提现金额趋势（元）</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={stats?.chart_data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`¥${v.toFixed(2)}`, '金额']} />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 补充统计 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-accent" />
                <h4 className="text-sm font-medium">平均审核时长</h4>
              </div>
              <p className="text-2xl font-bold text-accent">{stats ? `${stats.avg_hours.toFixed(1)}h` : '-'}</p>
              <p className="text-xs text-muted-foreground">从提交到审核完成</p>
            </div>
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight size={14} className="text-green-600" />
                <h4 className="text-sm font-medium">审核通过率</h4>
              </div>
              <div className="space-y-1.5">
                <p className="text-2xl font-bold text-green-600">{stats?.approval_rate ?? 0}%</p>
                <Progress value={stats?.approval_rate ?? 0} className="h-2" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-blue-600" />
                <h4 className="text-sm font-medium">待审核提现</h4>
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats?.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground">需及时处理</p>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════ 风险预警 ══════════════════ */}
        <TabsContent value="risk" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* 风险申请列表 */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-destructive" />
                  <h3 className="text-sm font-semibold">风险预警申请</h3>
                  <Badge variant="destructive" className="text-[10px] px-1.5">{riskItems.length}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchRisk} className="h-7 w-7 p-0 border border-border">
                  <RefreshCw size={12} />
                </Button>
              </div>

              {riskLoading ? (
                <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />加载中...
                </div>
              ) : riskItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
                  <Shield size={24} className="mx-auto mb-2 text-green-500 opacity-60" />
                  暂无风险申请
                </div>
              ) : (
                <div className="space-y-2">
                  {riskItems.map(item => (
                    <div key={item.id}
                      className={`bg-card border rounded-sm p-3 flex items-center gap-3 ${item.risk_level === 'high' ? 'border-red-200 bg-red-50/30' : 'border-yellow-200 bg-yellow-50/30'}`}>
                      <div className={`w-2 h-full min-h-8 rounded-sm shrink-0 ${item.risk_level === 'high' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono font-medium">{(item.user as any)?.phone ?? '-'}</span>
                          <RiskBadge level={item.risk_level} />
                          <span className="text-[10px] text-muted-foreground">{ACCT_LABEL[item.account_type] ?? item.account_type}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono font-bold text-primary">¥{Number(item.amount).toFixed(2)}</span>
                          <span>{new Date(item.created_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => { setDetailItem(item); fetchLogs(item.id); }}
                          className="h-6 w-6 p-0 border border-border">
                          <Eye size={11} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openReview(item, 'approve')}
                          className="h-6 px-2 text-xs border border-green-300 text-green-700 hover:bg-green-50">
                          批准
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openReview(item, 'reject')}
                          className="h-6 px-2 text-xs border border-destructive/30 text-destructive hover:bg-destructive/5">
                          拒绝
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 风险规则配置 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-primary" />
                <h3 className="text-sm font-semibold">风险规则配置</h3>
              </div>
              <div className="space-y-3">
                {riskRules.map(rule => (
                  <div key={rule.id} className="bg-card border border-border rounded-sm p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{rule.rule_name}</p>
                      <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule)} className="scale-75" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{rule.description}</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] text-muted-foreground shrink-0">阈值</Label>
                      <Input
                        type="number"
                        defaultValue={rule.threshold}
                        onBlur={e => {
                          const v = Number(e.target.value);
                          if (v !== rule.threshold) saveRuleThreshold(rule, v);
                        }}
                        className="h-6 text-xs bg-muted border-border font-mono px-2"
                        disabled={!rule.is_active}
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {rule.rule_key === 'freq_7d' ? '次' : '元'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ══ 详情弹窗 ══ */}
      <Dialog open={!!detailItem} onOpenChange={o => { if (!o) { setDetailItem(null); setReviewLogs([]); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CreditCard size={14} className="text-primary" />提现申请详情
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4 mt-1 text-xs">
              {/* 基础信息 */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-sm">
                {[
                  ['申请用户', (detailItem.user as any)?.phone ?? '-'],
                  ['用户昵称', (detailItem.user as any)?.nickname ?? '-'],
                  ['账户类型', ACCT_LABEL[detailItem.account_type] ?? detailItem.account_type],
                  ['提现金额', `¥${Number(detailItem.amount).toFixed(2)}`],
                  ['银行名称', detailItem.bank_name ?? '-'],
                  ['收款账号', maskAccount(detailItem.bank_account)],
                  ['持卡人', detailItem.bank_holder ?? '-'],
                  ['申请时间', new Date(detailItem.created_at).toLocaleString('zh-CN')],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-muted-foreground mb-0.5">{k}</p>
                    <p className="font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>

              {/* 状态与风险 */}
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={detailItem.status} />
                <RiskBadge level={detailItem.risk_level ?? 'normal'} />
                <StageBadge stage={detailItem.review_stage ?? 'pending'} />
              </div>

              {detailItem.reject_reason && (
                <div className="p-2.5 bg-destructive/10 border border-destructive/30 rounded-sm flex gap-2">
                  <AlertTriangle size={12} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-destructive">拒绝原因：{detailItem.reject_reason}</p>
                </div>
              )}

              {/* 审核操作（待审核时显示） */}
              {detailItem.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" onClick={() => { openReview(detailItem, 'approve'); setDetailItem(null); }}
                    className="h-8 px-4 text-xs gap-1.5 flex-1 bg-green-600 hover:bg-green-700 text-white border-0">
                    <CheckCircle size={12} />批准申请
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { openReview(detailItem, 'reject'); setDetailItem(null); }}
                    className="h-8 px-4 text-xs gap-1.5 flex-1 border border-destructive/30 text-destructive hover:bg-destructive/5">
                    <XCircle size={12} />拒绝申请
                  </Button>
                </div>
              )}
              {detailItem.status === 'approved' && (
                <Button size="sm" onClick={() => { openReview(detailItem, 'paid'); setDetailItem(null); }}
                  className="h-8 px-4 text-xs gap-1.5 w-full border border-blue-300 text-blue-700 hover:bg-blue-50" variant="ghost">
                  <Banknote size={12} />标记已到账
                </Button>
              )}

              {/* 审核日志 */}
              {reviewLogs.length > 0 && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <FileText size={12} className="text-primary" />审核轨迹
                  </p>
                  <div className="space-y-2">
                    {reviewLogs.map((log, i) => (
                      <div key={log.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-bold ${i === reviewLogs.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40'}`}>{i + 1}</div>
                          {i < reviewLogs.length - 1 && <div className="w-px flex-1 bg-border min-h-4 mt-0.5" />}
                        </div>
                        <div className="pb-2">
                          <p className="text-xs font-medium text-foreground">{ACTION_LABELS[log.action] ?? log.action}</p>
                          {log.comment && <p className="text-[10px] text-muted-foreground mt-0.5">{log.comment}</p>}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(log.created_at).toLocaleString('zh-CN')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ 审核操作弹窗 ══ */}
      <Dialog open={reviewOpen} onOpenChange={o => { if (!o && !reviewLoading) setReviewOpen(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {reviewAction === 'approve' ? '批准提现申请' : reviewAction === 'reject' ? '拒绝提现申请' : '标记已到账'}
            </DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-3 mt-1 text-xs">
              <div className="p-3 bg-muted/40 rounded-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">用户</span>
                  <span className="font-mono">{(reviewTarget.user as any)?.phone ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">金额</span>
                  <span className="font-mono font-bold text-primary">¥{Number(reviewTarget.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">风险等级</span>
                  <RiskBadge level={reviewTarget.risk_level ?? 'normal'} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {reviewAction === 'reject' ? '拒绝原因（选填）' : '审核备注（选填）'}
                </Label>
                <Textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                  placeholder={reviewAction === 'reject' ? '请输入拒绝原因' : '可填写审核备注'}
                  className="text-xs bg-muted border-border min-h-16 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setReviewOpen(false)}
                  className="h-8 px-3 text-xs border border-border" disabled={reviewLoading}>取消</Button>
                <Button size="sm" onClick={submitReview} disabled={reviewLoading}
                  className={`h-8 px-4 text-xs ${reviewAction === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90 border-0' : reviewAction === 'paid' ? '' : 'bg-green-600 text-white hover:bg-green-700 border-0'}`}>
                  {reviewLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  {reviewAction === 'approve' ? '确认批准' : reviewAction === 'reject' ? '确认拒绝' : '确认到账'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ 批量操作确认 ══ */}
      <AlertDialog open={!!batchDialog} onOpenChange={o => { if (!o) setBatchDialog(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {batchDialog === 'approve' ? '确认批量批准？' : '确认批量拒绝？'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {batchDialog === 'approve'
                ? `将批准选中的 ${checkedIds.size} 笔提现申请，资金将进入打款流程。`
                : `将拒绝选中的 ${checkedIds.size} 笔提现申请，申请状态将更新为已拒绝。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" disabled={batchLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDialog && executeBatch(batchDialog)}
              disabled={batchLoading}
              className={`h-8 text-xs ${batchDialog === 'reject' ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700'}`}>
              {batchLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
              {batchDialog === 'approve' ? '批量批准' : '批量拒绝'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
