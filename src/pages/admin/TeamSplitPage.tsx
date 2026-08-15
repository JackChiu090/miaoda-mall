// 拆人管理：拆人记录 + 子商城状态管理
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users2, RefreshCw, Search, Store, Settings } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface TeamSplit {
  id: string;
  leader_user_id: string;
  sub_mall_name: string;
  sub_mall_status: string;
  team_shop_count: number;
  team_volume: number;
  triggered_by: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  users: { phone: string; nickname: string | null } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active:    { label: '运营中',  variant: 'secondary' },
  suspended: { label: '已暂停',  variant: 'outline' },
  closed:    { label: '已关闭',  variant: 'destructive' },
};

export default function TeamSplitPage() {
  const [splits, setSplits] = useState<TeamSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<TeamSplit | null>(null);
  const [newStatus, setNewStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const [shopThreshold, setShopThreshold] = useState(25);

  async function load() {
    setLoading(true);
    const [{ data: sData }, { data: cData }] = await Promise.all([
      supabase.from('team_splits').select('*, users(phone, nickname)').order('created_at', { ascending: false }),
      supabase.from('system_configs').select('config_value').eq('config_key', 'team_split_shop_count').maybeSingle(),
    ]);
    setSplits((sData as unknown as TeamSplit[]) ?? []);
    if (cData) setShopThreshold(Number(cData.config_value));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUpdateStatus() {
    if (!editTarget) return;
    setSaving(true);
    const { error } = await supabase.from('team_splits')
      .update({ sub_mall_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', editTarget.id);
    setSaving(false);
    if (error) { toast.error('更新失败'); return; }
    toast.success('子商城状态已更新');
    setEditTarget(null);
    load();
  }

  const filtered = splits.filter(s => {
    const phone = s.users?.phone ?? '';
    return !search || phone.includes(search) || s.sub_mall_name.includes(search);
  });

  const counts = {
    active:    splits.filter(s => s.sub_mall_status === 'active').length,
    suspended: splits.filter(s => s.sub_mall_status === 'suspended').length,
    closed:    splits.filter(s => s.sub_mall_status === 'closed').length,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="拆人管理"
        description={`团队有效商铺满 ${shopThreshold} 个且满足交易额条件时自动孵化为独立子商城`}
        action={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '运营中子商城', value: counts.active, color: 'text-green-600' },
          { label: '已暂停', value: counts.suspended, color: 'text-warning' },
          { label: '已关闭', value: counts.closed, color: 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Store size={22} className={s.color} />
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
          placeholder="搜索手机号或商城名…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 列表 */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>团长手机号</TableHead>
              <TableHead>子商城名称</TableHead>
              <TableHead className="whitespace-nowrap">有效商铺数</TableHead>
              <TableHead className="whitespace-nowrap">团队交易额</TableHead>
              <TableHead>触发方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="whitespace-nowrap">孵化时间</TableHead>
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
                  暂无拆人记录
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => {
                const si = STATUS_MAP[s.sub_mall_status] ?? { label: s.sub_mall_status, variant: 'outline' as const };
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium whitespace-nowrap">{s.users?.phone ?? '-'}</TableCell>
                    <TableCell className="font-medium">{s.sub_mall_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.team_shop_count} 个</TableCell>
                    <TableCell className="whitespace-nowrap">¥{Number(s.team_volume).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={s.triggered_by === 'manual' ? 'default' : 'secondary'} className="text-xs">
                        {s.triggered_by === 'manual' ? '手动' : '自动'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={si.variant} className="text-xs">{si.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(s.created_at).toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => { setEditTarget(s); setNewStatus(s.sub_mall_status); }}
                      >
                        <Settings size={11} />管理
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 状态管理弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle>管理子商城状态</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">团长</span>
                <span className="font-medium">{editTarget?.users?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">商城名称</span>
                <span className="font-medium">{editTarget?.sub_mall_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">有效商铺</span>
                <span>{editTarget?.team_shop_count} 个</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>子商城状态</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">运营中</SelectItem>
                  <SelectItem value="suspended">暂停</SelectItem>
                  <SelectItem value="closed">关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
            <Button onClick={handleUpdateStatus} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
