// 早市商家分级激励管理：参数配置 + 奖励发放记录查看（仅超级管理员）
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Save, Trophy, Settings, Info } from 'lucide-react';
import { toast } from 'sonner';

interface IncentiveConfig {
  id: string;
  regular_first_order_limit: number;
  trial_first_order_limit: number;
  deadline_hour: number;
  deadline_minute: number;
  reward_rate: number;
}

interface RewardRecord {
  id: string;
  order_id: string;
  buyer_id: string;
  reward_amount: number;
  recipient_id: string;
  recipient_level: number;
  reward_rate: number;
  created_at: string;
  buyer?: { phone: string; nickname?: string; real_name?: string } | null;
  recipient?: { phone: string; nickname?: string; real_name?: string } | null;
}

const PAGE_SIZE = 20;

export default function MorningIncentivePage() {
  const [config, setConfig] = useState<IncentiveConfig | null>(null);
  const [form, setForm] = useState({ regular_first_order_limit: 2, trial_first_order_limit: 1, deadline_hour: 12, deadline_minute: 0, reward_rate: 0.002 });
  const [saving, setSaving] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(true);

  const [records, setRecords] = useState<RewardRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const loadConfig = useCallback(async () => {
    setLoadingCfg(true);
    const { data } = await supabase
      .from('morning_incentive_config')
      .select('id, regular_first_order_limit, trial_first_order_limit, deadline_hour, deadline_minute, reward_rate')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setConfig(data);
      setForm({
        regular_first_order_limit: data.regular_first_order_limit,
        trial_first_order_limit: data.trial_first_order_limit,
        deadline_hour: data.deadline_hour,
        deadline_minute: data.deadline_minute,
        reward_rate: Number(data.reward_rate),
      });
    }
    setLoadingCfg(false);
  }, []);

  const loadRecords = useCallback(async (p: number) => {
    setLoadingRecords(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('morning_reward_records')
      .select('id, order_id, buyer_id, reward_amount, recipient_id, recipient_level, reward_rate, created_at, buyer:users!morning_reward_records_buyer_id_fkey(phone,nickname,real_name), recipient:users!morning_reward_records_recipient_id_fkey(phone,nickname,real_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    setRecords((data as unknown as RewardRecord[]) ?? []);
    setTotal(count ?? 0);
    setLoadingRecords(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadRecords(page); }, [loadRecords, page]);

  const handleSave = async () => {
    if (form.regular_first_order_limit < 1) { toast.error('正式商家限购数量需大于等于1'); return; }
    if (form.trial_first_order_limit < 1) { toast.error('体验商家限购数量需大于等于1'); return; }
    if (form.deadline_hour < 0 || form.deadline_hour > 23) { toast.error('完成时间小时需在 0-23 之间'); return; }
    if (form.deadline_minute < 0 || form.deadline_minute > 59) { toast.error('完成时间分钟需在 0-59 之间'); return; }
    if (form.reward_rate <= 0 || form.reward_rate > 1) { toast.error('奖励比例需在 0-1 之间（如 0.002 表示 0.2%）'); return; }
    setSaving(true);
    const payload = {
      regular_first_order_limit: form.regular_first_order_limit,
      trial_first_order_limit: form.trial_first_order_limit,
      deadline_hour: form.deadline_hour,
      deadline_minute: form.deadline_minute,
      reward_rate: form.reward_rate,
      updated_at: new Date().toISOString(),
    };
    // 无配置行时自动创建（首次配置），否则更新现有行
    const { error } = config
      ? await supabase.from('morning_incentive_config').update(payload).eq('id', config.id)
      : await supabase.from('morning_incentive_config').insert(payload).select('id').single();
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('激励参数已保存');
    loadConfig();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const displayName = (u?: { phone: string; nickname?: string; real_name?: string } | null) =>
    u ? (u.real_name || u.nickname || u.phone) : '—';

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader title="早市商家分级激励" description="配置早市激励参数，查看奖励发放记录" />

        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config" className="gap-1.5"><Settings size={14} />激励参数</TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5"><Trophy size={14} />奖励发放记录</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-4">
            {loadingCfg ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <div className="max-w-2xl space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">激励参数配置</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label>正式商家限购数量（单）</Label>
                        <Input
                          type="number" min={1}
                          value={form.regular_first_order_limit}
                          onChange={e => setForm(f => ({ ...f, regular_first_order_limit: Number(e.target.value) }))}
                        />
                        <p className="text-xs text-muted-foreground">正式商家在早市完成首单购买的限购数量</p>
                      </div>
                      <div className="space-y-2">
                        <Label>体验商家限购数量（单）</Label>
                        <Input
                          type="number" min={1}
                          value={form.trial_first_order_limit}
                          onChange={e => setForm(f => ({ ...f, trial_first_order_limit: Number(e.target.value) }))}
                        />
                        <p className="text-xs text-muted-foreground">体验商家在早市完成首单购买的限购数量</p>
                      </div>
                      <div className="space-y-2">
                        <Label>奖励比例</Label>
                        <Input
                          type="number" step="0.0001" min={0} max={1}
                          value={form.reward_rate}
                          onChange={e => setForm(f => ({ ...f, reward_rate: Number(e.target.value) }))}
                        />
                        <p className="text-xs text-muted-foreground">当前约 {(form.reward_rate * 100).toFixed(2)}%（下级订单金额的该比例作为奖励）</p>
                      </div>
                      <div className="space-y-2">
                        <Label>规定完成时间 - 小时</Label>
                        <Input
                          type="number" min={0} max={23}
                          value={form.deadline_hour}
                          onChange={e => setForm(f => ({ ...f, deadline_hour: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>规定完成时间 - 分钟</Label>
                        <Input
                          type="number" min={0} max={59}
                          value={form.deadline_minute}
                          onChange={e => setForm(f => ({ ...f, deadline_minute: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 bg-muted/60 rounded-lg p-3">
                      <Info size={14} className="text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        规定完成时间默认为周一至周五 {String(form.deadline_hour).padStart(2, '0')}:{String(form.deadline_minute).padStart(2, '0')} 前。
                        下级商家订单确认收款后，系统沿推荐链路逐级向上检查，奖励分配给链路中首个在该时间前完成订单交易的上级商家。
                      </p>
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                      <Save size={15} />{saving ? '保存中…' : '保存参数'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="records" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="w-full max-w-full overflow-x-auto bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">发放时间</TableHead>
                        <TableHead className="whitespace-nowrap">下级商家</TableHead>
                        <TableHead className="whitespace-nowrap">获奖上级</TableHead>
                        <TableHead className="whitespace-nowrap">上级层级</TableHead>
                        <TableHead className="whitespace-nowrap">奖励比例</TableHead>
                        <TableHead className="whitespace-nowrap text-right">奖励金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingRecords ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                          </TableRow>
                        ))
                      ) : records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-12">暂无奖励发放记录</TableCell>
                        </TableRow>
                      ) : (
                        records.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{displayName(r.buyer)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{displayName(r.recipient)}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className="text-[10px]">第{r.recipient_level}级上级</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{(Number(r.reward_rate) * 100).toFixed(2)}%</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-semibold text-primary">¥{Number(r.reward_amount).toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">共 {total} 条</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一页</Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>下一页</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}