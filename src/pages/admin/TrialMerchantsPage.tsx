// 体验商家列表：展示所有体验商家（注册起 trial_required_days 个工作日内未推广任何商家）
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface TrialMerchant {
  id: string;
  phone: string;
  nickname: string | null;
  real_name: string | null;
  created_at: string;
  referral_count: number;
}

export default function TrialMerchantsPage() {
  const [rows, setRows] = useState<TrialMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [requiredDays, setRequiredDays] = useState('15');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    // 读取体验商家考核工作日数
    const { data: cfg } = await supabase
      .from('system_settings').select('value').eq('key', 'trial_required_days').maybeSingle();
    if (cfg?.value) setRequiredDays(cfg.value);

    // 体验商家列表（含直推人数，用于核对判断逻辑）
    const { data: users } = await supabase
      .from('users')
      .select('id, phone, nickname, real_name, created_at')
      .eq('merchant_type', 'trial')
      .order('created_at', { ascending: false });
    const list = (users ?? []) as any[];
    // 统计每个体验商家的直推人数
    const ids = list.map(u => u.id);
    let countMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: refs } = await supabase
        .from('users').select('referrer_id').in('referrer_id', ids);
      countMap = {};
      (refs ?? []).forEach((r: { referrer_id: string }) => {
        countMap[r.referrer_id] = (countMap[r.referrer_id] ?? 0) + 1;
      });
    }
    setRows(list.map(u => ({
      id: u.id, phone: u.phone, nickname: u.nickname, real_name: u.real_name,
      created_at: u.created_at, referral_count: countMap[u.id] ?? 0,
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    const days = parseInt(requiredDays) || 15;
    if (days < 1) { toast.error('考核工作日数需大于等于1'); return; }
    setSaving(true);
    const { error } = await supabase.from('system_settings').upsert({
      key: 'trial_required_days', value: String(days), updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('考核工作日数已保存');
    load();
  }

  return (
    <AdminLayout>
      <PageHeader
        title="体验商家列表"
        description="注册起 N 个工作日内未推广任何商家的用户列为体验商家"
        action={
          <Button size="sm" variant="ghost" onClick={load} className="h-8 gap-1.5 text-xs border border-border">
            <RefreshCw size={13} />刷新
          </Button>
        }
      />

      {/* 参数配置 */}
      <div className="flex items-end gap-3 mb-4 bg-card border border-border rounded-sm p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">体验商家考核工作日数</label>
          <p className="text-[10px] text-muted-foreground">注册起在此工作日天数内未推广任何商家则列为体验商家</p>
          <Input type="number" min={1} value={requiredDays}
            onChange={e => setRequiredDays(e.target.value)}
            className="h-8 text-xs bg-muted border-border w-32 font-mono px-2" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">天</span>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 h-8">
          <Save size={14} />{saving ? '保存中...' : '保存参数'}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">手机号</TableHead>
              <TableHead className="whitespace-nowrap">昵称/姓名</TableHead>
              <TableHead className="whitespace-nowrap">注册时间</TableHead>
              <TableHead className="whitespace-nowrap text-center">直推人数</TableHead>
              <TableHead className="whitespace-nowrap">商家类型</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-xs">加载中...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-xs">暂无体验商家</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-mono whitespace-nowrap">{r.phone}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.real_name || r.nickname || '-'}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('zh-CN', { hour12: false })}
                </TableCell>
                <TableCell className="text-xs text-center font-mono">{r.referral_count}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="secondary" className="text-[11px]">体验商家</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
