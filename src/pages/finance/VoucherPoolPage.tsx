import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { VoucherPool } from '@/types/types';

export default function VoucherPoolPage() {
  const [pool, setPool] = useState<VoucherPool | null>(null);
  const [threshold, setThreshold] = useState('3980');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchPool() {
    setLoading(true);
    const { data } = await supabase.from('voucher_pool').select('*').order('id', { ascending: true }).limit(1).maybeSingle();
    setPool(data ?? null);
    if (data) setThreshold(String(data.threshold));
    setLoading(false);
  }

  useEffect(() => { fetchPool(); }, []);

  async function handleSaveThreshold() {
    if (!pool) return;
    const val = parseFloat(threshold);
    if (isNaN(val) || val <= 0) { toast.error('请输入有效的金额'); return; }
    setSaving(true);
    const { error } = await supabase.from('voucher_pool').update({ threshold: val, updated_at: new Date().toISOString() }).eq('id', pool.id);
    setSaving(false);
    if (error) { toast.error('保存失败'); return; }
    toast.success('兑换阈值已更新');
    fetchPool();
  }

  const pct = pool ? Math.min((pool.accumulated / pool.threshold) * 100, 100) : 0;

  return (
    <AdminLayout>
      <PageHeader title="代金券兑换" description="累计达到阈值后可兑换实物，资金来源为每笔成交订单的 0.3% 计提" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {/* 资金池状态 */}
        <div className="bg-card border border-border rounded-sm p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">当前累计金额</p>
            <p className="kpi-number text-3xl font-medium text-primary">
              {loading ? '-' : `¥${Number(pool?.accumulated ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">进度</span>
              <span className="text-foreground">{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-sm overflow-hidden">
              <div className="h-full bg-primary rounded-sm transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">¥0</span>
              <span className="text-muted-foreground">目标：¥{pool ? Number(pool.threshold).toFixed(0) : threshold}</span>
            </div>
          </div>
          <div className="pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>已兑换次数</span>
              <span className="text-foreground">{pool?.total_exchanged_count ?? 0} 次</span>
            </div>
            {pool?.last_exchange_at && (
              <div className="flex justify-between">
                <span>上次兑换时间</span>
                <span className="text-foreground">{new Date(pool.last_exchange_at).toLocaleDateString('zh-CN')}</span>
              </div>
            )}
          </div>
        </div>

        {/* 阈值配置 */}
        <div className="bg-card border border-border rounded-sm p-5 space-y-4">
          <h3 className="text-sm font-medium">兑换阈值配置</h3>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">累计达到多少元可兑换实物（元）</Label>
            <Input type="number" min={1} value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="h-8 text-sm bg-muted border-border font-mono w-40" />
          </div>
          <Button onClick={handleSaveThreshold} disabled={saving || loading} className="gap-2 h-8 text-xs">
            <Save size={13} />{saving ? '保存中...' : '保存阈值'}
          </Button>

          <div className="p-3 bg-muted/50 border border-border rounded-sm text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">规则说明</p>
            <p>• 每笔成交订单按成交金额的 0.3% 计入资金池</p>
            <p>• 累计达到阈值后，管理员手动触发实物兑换流程</p>
            <p>• 兑换为实物奖励，不发放现金</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
