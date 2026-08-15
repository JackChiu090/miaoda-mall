// 淘汰清理管理：淘汰用户列表 + 重新考核审核
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Trash2, RefreshCw, Search, UserX, RotateCcw, Play, CheckCircle2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface EliminationRecord {
  id: string;
  user_id: string;
  reason: string;
  reason_detail: string | null;
  eliminated_by: string;
  eliminated_at: string;
  restored_at: string | null;
  restored_by: string | null;
  restore_note: string | null;
  reassess_status: string | null;
  created_at: string;
  users: { phone: string; nickname: string | null; user_status: string } | null;
}

const REASON_MAP: Record<string, string> = {
  inactive:     '近30天未登录',
  no_invite:    '未完成招商',
  multi_account:'疑似多开小号',
  manual:       '管理员手动淘汰',
  assessment:   '考核未通过',
};

export default function EliminationPage() {
  const [records, setRecords] = useState<EliminationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [confirmScan, setConfirmScan] = useState(false);
  const [scanning, setScanning] = useState(false);

  // 重新考核审核弹窗
  const [reviewTarget, setReviewTarget] = useState<EliminationRecord | null>(null);
  const [restoreNote, setRestoreNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('elimination_records')
      .select('*, users(phone, nickname, user_status)')
      .order('eliminated_at', { ascending: false });
    setRecords((data as unknown as EliminationRecord[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleScan() {
    setScanning(true);
    setConfirmScan(false);
    const { error } = await supabase.functions.invoke('elimination-scan', {
      body: { triggered_by: 'manual' },
    });
    setScanning(false);
    if (error) { toast.error('扫描触发失败'); return; }
    toast.success('淘汰扫描任务已触发，稍后刷新查看结果');
    load();
  }

  async function handleReassess(approve: boolean) {
    if (!reviewTarget) return;
    setSaving(true);
    const newReassessStatus = approve ? 'approved' : 'rejected';
    const { error } = await supabase
      .from('elimination_records')
      .update({
        reassess_status: newReassessStatus,
        restored_at: approve ? new Date().toISOString() : null,
        restored_by: approve ? '管理员' : null,
        restore_note: restoreNote || null,
      })
      .eq('id', reviewTarget.id);

    if (!error && approve) {
      // 恢复用户状态为 trial（重新走考核流程）
      await supabase.from('users').update({
        user_status: 'trial',
        assessment_status: 'pending',
        eliminated_at: null,
        trial_start_at: new Date().toISOString(),
        trial_end_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      }).eq('id', reviewTarget.user_id);

      // 创建新考核记录
      await supabase.from('user_assessments').insert({
        user_id: reviewTarget.user_id,
        trial_start_at: new Date().toISOString(),
        trial_end_at: new Date(Date.now() + 5 * 86400000).toISOString(),
        orders_completed: 0,
        invites_completed: 0,
        status: 'in_progress',
      });
    }

    setSaving(false);
    if (error) { toast.error('操作失败'); return; }
    toast.success(approve ? '已批准重新考核，用户进入体验期' : '已拒绝重新考核申请');
    setReviewTarget(null);
    setRestoreNote('');
    load();
  }

  const filteredRecords = records.filter(r => {
    const phone = r.users?.phone ?? '';
    const matchSearch = !search || phone.includes(search);
    const matchTab = tab === 'all'
      || (tab === 'eliminated' && !r.restored_at)
      || (tab === 'restored' && r.restored_at)
      || (tab === 'pending_reassess' && r.reassess_status === 'pending');
    return matchSearch && matchTab;
  });

  const counts = {
    eliminated:      records.filter(r => !r.restored_at).length,
    restored:        records.filter(r => r.restored_at).length,
    pending_reassess: records.filter(r => r.reassess_status === 'pending').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* 头部 */}
      <PageHeader
        title="淘汰清理管理"
        description="每周自动扫描近30天未登录、未招商、疑似多开用户，标记淘汰保留资金，支持重新考核恢复"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw size={14} />刷新
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={scanning}
              onClick={() => setConfirmScan(true)}
            >
              {scanning
                ? <><RefreshCw size={14} className="animate-spin" />扫描中…</>
                : <><Play size={14} />手动触发淘汰扫描</>}
            </Button>
          </div>
        }
      />

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '待恢复淘汰用户', value: counts.eliminated, icon: UserX, color: 'text-destructive' },
          { label: '待审核重考申请', value: counts.pending_reassess, icon: RotateCcw, color: 'text-warning' },
          { label: '已恢复用户', value: counts.restored, icon: CheckCircle2, color: 'text-green-600' },
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
          <TabsTrigger value="all">全部（{records.length}）</TabsTrigger>
          <TabsTrigger value="eliminated">淘汰中（{counts.eliminated}）</TabsTrigger>
          <TabsTrigger value="pending_reassess">
            待审核（{counts.pending_reassess}）
          </TabsTrigger>
          <TabsTrigger value="restored">已恢复（{counts.restored}）</TabsTrigger>
        </TabsList>

        {['all','eliminated','pending_reassess','restored'].map(t => (
          <TabsContent key={t} value={t} className="mt-4">
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户手机号</TableHead>
                    <TableHead>淘汰原因</TableHead>
                    <TableHead className="whitespace-nowrap">淘汰时间</TableHead>
                    <TableHead className="whitespace-nowrap">触发方式</TableHead>
                    <TableHead>重考状态</TableHead>
                    <TableHead className="whitespace-nowrap">恢复时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {r.users?.phone ?? '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{REASON_MAP[r.reason] ?? r.reason}</p>
                            {r.reason_detail && (
                              <p className="text-xs text-muted-foreground mt-0.5">{r.reason_detail}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {new Date(r.eliminated_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.eliminated_by === '管理员' ? 'default' : 'secondary'} className="text-xs">
                            {r.eliminated_by === '管理员' ? '手动' : '系统'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.reassess_status == null ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            <Badge
                              variant={
                                r.reassess_status === 'approved' ? 'secondary'
                                  : r.reassess_status === 'rejected' ? 'destructive'
                                    : 'outline'
                              }
                              className="text-xs"
                            >
                              {r.reassess_status === 'approved' ? '已批准'
                                : r.reassess_status === 'rejected' ? '已拒绝'
                                  : '待审核'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {r.restored_at ? new Date(r.restored_at).toLocaleString('zh-CN') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {(!r.restored_at) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => { setReviewTarget(r); setRestoreNote(''); }}
                            >
                              <RotateCcw size={11} />重新考核
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* 重新考核弹窗 */}
      <Dialog open={!!reviewTarget} onOpenChange={open => { if (!open) setReviewTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>处理重新考核申请</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">用户手机号</span>
                <span className="font-medium">{reviewTarget?.users?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">淘汰原因</span>
                <span>{REASON_MAP[reviewTarget?.reason ?? ''] ?? reviewTarget?.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">淘汰时间</span>
                <span className="text-xs">{reviewTarget && new Date(reviewTarget.eliminated_at).toLocaleString('zh-CN')}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>处理备注（选填）</Label>
              <Textarea
                placeholder="请输入处理备注…"
                rows={3}
                value={restoreNote}
                onChange={e => setRestoreNote(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              批准后用户将重置为体验期状态，重新完成考核任务后方可恢复正式权限
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" disabled={saving} onClick={() => handleReassess(false)} className="gap-1.5">
              <XCircle size={14} />{saving ? '处理中…' : '拒绝申请'}
            </Button>
            <Button disabled={saving} onClick={() => handleReassess(true)} className="gap-1.5">
              <CheckCircle2 size={14} />{saving ? '处理中…' : '批准重新考核'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 确认扫描 */}
      <AlertDialog open={confirmScan} onOpenChange={setConfirmScan}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认手动触发淘汰扫描？</AlertDialogTitle>
            <AlertDialogDescription>
              系统将扫描近30天未登录、未招商、疑似多开的用户并标记淘汰状态。
              此操作保留用户资金，仅清除交易与招商权限。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleScan}>立即扫描</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
