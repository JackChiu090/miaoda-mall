// 招商考核管理：考核进度查看 + 手动审核
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ClipboardList, Search, RefreshCw, CheckCircle2, XCircle,
  User, Clock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface Assessment {
  id: string;
  user_id: string;
  trial_start_at: string;
  trial_end_at: string;
  orders_completed: number;
  invites_completed: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  users: { phone: string; nickname: string | null; user_status: string } | null;
}

interface Config {
  trial_period_days: number;
  assessment_min_orders: number;
  assessment_min_invites: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  in_progress:  { label: '考核中',   variant: 'default' },
  passed:       { label: '自动通过', variant: 'secondary' },
  failed:       { label: '未通过',   variant: 'destructive' },
  manual_pass:  { label: '手动通过', variant: 'secondary' },
  manual_fail:  { label: '手动拒绝', variant: 'destructive' },
};

function daysLeft(end: string) {
  const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  return diff;
}

export default function MerchantAssessmentPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [config, setConfig] = useState<Config>({
    trial_period_days: 5,
    assessment_min_orders: 1,
    assessment_min_invites: 0,
  });

  // 手动审核弹窗
  const [reviewTarget, setReviewTarget] = useState<Assessment | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: aData }, { data: cData }] = await Promise.all([
      supabase
        .from('user_assessments')
        .select('*, users(phone, nickname, user_status)')
        .order('created_at', { ascending: false }),
      supabase
        .from('system_configs')
        .select('config_key, config_value')
        .in('config_key', ['trial_period_days', 'assessment_min_orders', 'assessment_min_invites']),
    ]);
    setAssessments((aData as unknown as Assessment[]) ?? []);
    if (cData) {
      const map: Record<string, string> = {};
      cData.forEach(r => { map[r.config_key] = r.config_value; });
      setConfig({
        trial_period_days:      Number(map.trial_period_days ?? 5),
        assessment_min_orders:  Number(map.assessment_min_orders ?? 1),
        assessment_min_invites: Number(map.assessment_min_invites ?? 0),
      });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleManualReview(pass: boolean) {
    if (!reviewTarget) return;
    setSaving(true);
    const newStatus = pass ? 'manual_pass' : 'manual_fail';
    const newUserStatus = pass ? 'active' : 'eliminated';

    const { error: aErr } = await supabase
      .from('user_assessments')
      .update({
        status: newStatus,
        reviewed_by: '管理员',
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote || null,
      })
      .eq('id', reviewTarget.id);

    if (!aErr) {
      await supabase.from('users')
        .update({
          user_status: newUserStatus,
          assessment_status: newStatus,
          promoted_at: pass ? new Date().toISOString() : null,
          eliminated_at: pass ? null : new Date().toISOString(),
        })
        .eq('id', reviewTarget.user_id);

      // 若淘汰则记录淘汰记录
      if (!pass) {
        await supabase.from('elimination_records').insert({
          user_id: reviewTarget.user_id,
          reason: 'manual',
          reason_detail: reviewNote || '管理员手动拒绝考核',
          eliminated_by: '管理员',
        });
      }
    }

    setSaving(false);
    if (aErr) { toast.error('操作失败'); return; }
    toast.success(pass ? '已通过考核，解锁用户权限' : '已拒绝考核，用户进入淘汰状态');
    setReviewTarget(null);
    setReviewNote('');
    load();
  }

  const filtered = assessments.filter(a => {
    const phone = a.users?.phone ?? '';
    const matchSearch = !search || phone.includes(search);
    const matchTab = tab === 'all' || a.status === tab;
    return matchSearch && matchTab;
  });

  const counts = {
    in_progress: assessments.filter(a => a.status === 'in_progress').length,
    failed:      assessments.filter(a => a.status === 'failed').length,
    passed:      assessments.filter(a => ['passed', 'manual_pass'].includes(a.status)).length,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="招商考核管理"
        description={`体验期 ${config.trial_period_days} 天 · 最少交易 ${config.assessment_min_orders} 单${config.assessment_min_invites > 0 ? ` · 最少招商 ${config.assessment_min_invites} 人` : ''}`}
        action={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '考核中', value: counts.in_progress, icon: Clock, color: 'text-blue-600' },
          { label: '待审核/未通过', value: counts.failed, icon: AlertTriangle, color: 'text-destructive' },
          { label: '已通过', value: counts.passed, icon: CheckCircle2, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <s.icon size={24} className={s.color} />
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 搜索 */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索手机号…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tab + 表格 */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">全部（{assessments.length}）</TabsTrigger>
          <TabsTrigger value="in_progress">考核中（{counts.in_progress}）</TabsTrigger>
          <TabsTrigger value="failed">未通过（{counts.failed}）</TabsTrigger>
          <TabsTrigger value="passed">通过</TabsTrigger>
          <TabsTrigger value="manual_pass">手动通过</TabsTrigger>
          <TabsTrigger value="manual_fail">手动拒绝</TabsTrigger>
        </TabsList>

        {['all','in_progress','failed','passed','manual_pass','manual_fail'].map(t => (
          <TabsContent key={t} value={t} className="mt-4">
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户手机号</TableHead>
                    <TableHead>体验期</TableHead>
                    <TableHead className="whitespace-nowrap">剩余天数</TableHead>
                    <TableHead className="whitespace-nowrap">完成交易</TableHead>
                    <TableHead className="whitespace-nowrap">完成招商</TableHead>
                    <TableHead>考核状态</TableHead>
                    <TableHead>审核备注</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(a => {
                      const left = daysLeft(a.trial_end_at);
                      const si = STATUS_MAP[a.status] ?? { label: a.status, variant: 'outline' as const };
                      const passedAssess = a.orders_completed >= config.assessment_min_orders
                        && a.invites_completed >= config.assessment_min_invites;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <User size={13} className="text-muted-foreground shrink-0" />
                              {a.users?.phone ?? '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(a.trial_start_at).toLocaleDateString('zh-CN')}
                            <span className="mx-1">~</span>
                            {new Date(a.trial_end_at).toLocaleDateString('zh-CN')}
                          </TableCell>
                          <TableCell>
                            {a.status === 'in_progress' ? (
                              <span className={left <= 1 ? 'text-destructive font-semibold' : 'text-foreground'}>
                                {left > 0 ? `${left}天` : '已到期'}
                              </span>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <span className={a.orders_completed >= config.assessment_min_orders ? 'text-green-600 font-semibold' : 'text-destructive'}>
                              {a.orders_completed}/{config.assessment_min_orders}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={config.assessment_min_invites === 0 || a.invites_completed >= config.assessment_min_invites ? 'text-green-600 font-semibold' : 'text-destructive'}>
                              {a.invites_completed}/{config.assessment_min_invites}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant={si.variant} className="text-xs">{si.label}</Badge>
                              {a.status === 'in_progress' && passedAssess && (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-200">达标</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                            {a.review_note ?? '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {['in_progress', 'failed'].includes(a.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => { setReviewTarget(a); setReviewNote(''); }}
                              >
                                手动审核
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* 手动审核弹窗 */}
      <Dialog open={!!reviewTarget} onOpenChange={open => { if (!open) setReviewTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>手动审核考核结果</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">用户手机号</span>
                <span className="font-medium">{reviewTarget?.users?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">完成交易</span>
                <span className={reviewTarget && reviewTarget.orders_completed >= config.assessment_min_orders ? 'text-green-600 font-semibold' : 'text-destructive font-semibold'}>
                  {reviewTarget?.orders_completed} / {config.assessment_min_orders}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">完成招商</span>
                <span>{reviewTarget?.invites_completed} / {config.assessment_min_invites}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>审核备注（选填）</Label>
              <Textarea
                placeholder="请输入审核备注…"
                rows={3}
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => handleManualReview(false)}
              className="gap-1.5"
            >
              <XCircle size={14} />{saving ? '处理中…' : '拒绝考核'}
            </Button>
            <Button
              disabled={saving}
              onClick={() => handleManualReview(true)}
              className="gap-1.5"
            >
              <CheckCircle2 size={14} />{saving ? '处理中…' : '通过考核'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
