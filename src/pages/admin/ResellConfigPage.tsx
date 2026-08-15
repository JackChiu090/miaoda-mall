// 转拍时间设置：配置每日转拍开始时间（默认 14:30），周一至周五有效；支持手动强制开启
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Clock, Info, Zap } from 'lucide-react';
import { toast } from 'sonner';

const KEYS = ['resell_start_hour', 'resell_start_minute', 'resell_manual_override'];

const DEFAULT_CFG = { resell_start_hour: '14', resell_start_minute: '30', resell_manual_override: 'false' };

function pad2(n: number) { return String(n).padStart(2, '0'); }

export default function ResellConfigPage() {
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // 加载
  useEffect(() => {
    supabase.from('system_settings').select('key,value').in('key', KEYS).then(({ data }) => {
      if (data?.length) {
        const map: Record<string, string> = {};
        data.forEach(r => { map[r.key] = r.value; });
        setCfg(prev => ({ ...prev, ...map }));
      }
      setLoading(false);
    });
  }, []);

  function setField(key: keyof typeof DEFAULT_CFG, val: string) {
    setCfg(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    const h = parseInt(cfg.resell_start_hour);
    const m = parseInt(cfg.resell_start_minute);
    if (isNaN(h) || h < 0 || h > 23) { toast.error('小时须在 0–23 之间'); return; }
    if (isNaN(m) || m < 0 || m > 59) { toast.error('分钟须在 0–59 之间'); return; }

    setSaving(true);
    const now = new Date().toISOString();
    const upserts = (['resell_start_hour', 'resell_start_minute'] as const).map(key => ({
      key,
      value: cfg[key],
      updated_at: now,
    }));
    const { error } = await supabase
      .from('system_settings')
      .upsert(upserts, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('转拍时间设置已保存');
  }

  // 切换手动强制开启/关闭
  async function handleToggleManual(checked: boolean) {
    setToggling(true);
    const newVal = checked ? 'true' : 'false';
    const { error } = await supabase.from('system_settings').upsert(
      { key: 'resell_manual_override', value: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    setToggling(false);
    if (error) { toast.error('操作失败：' + error.message); return; }
    setCfg(prev => ({ ...prev, resell_manual_override: newVal }));
    toast.success(checked ? '✅ 已手动开启转拍通道，所有用户现在可随时转拍' : '🔒 手动转拍已关闭，恢复按时间段控制');
  }

  const isManualOn = cfg.resell_manual_override === 'true';
  const displayTime = `${pad2(parseInt(cfg.resell_start_hour) || 14)}:${pad2(parseInt(cfg.resell_start_minute) || 30)}`;

  return (
    <AdminLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <PageHeader
          title="转拍时间设置"
          description="设置每日开放转拍的起始时间，规则：周一至周五该时间起，持续到次日进货抢购开始前"
        />

        {/* 手动强制开启卡片 */}
        <Card className={isManualOn ? 'border-orange-400 bg-orange-500/5' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap size={16} className={isManualOn ? 'text-orange-500' : 'text-muted-foreground'} />
              手动转拍通道
            </CardTitle>
            <CardDescription>
              开启后，所有用户不受时间限制，可立即进行转拍操作。关闭后恢复按时间段控制。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-9 w-40" />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    当前状态：
                    <span className={isManualOn ? 'text-orange-500 font-bold ml-1' : 'text-muted-foreground ml-1'}>
                      {isManualOn ? '🟠 手动开启中' : '⚫ 已关闭（按时间控制）'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isManualOn ? '所有已入库订单现在均可转拍' : `仅在 ${displayTime} 后可转拍（周一至周五）`}
                  </p>
                </div>
                <Switch
                  checked={isManualOn}
                  disabled={toggling}
                  onCheckedChange={handleToggleManual}
                  className="data-[state=checked]:bg-orange-500"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 定时配置卡片 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock size={16} className="text-primary" />每日转拍开始时间
            </CardTitle>
            <CardDescription>
              当前设置：每周一至周五 <span className="font-semibold text-foreground">{displayTime}</span> 开始允许转拍，持续至次日进货抢购开始前
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex gap-4">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">小时（0–23）</Label>
                    <Input
                      type="number" min={0} max={23}
                      value={cfg.resell_start_hour}
                      onChange={e => setField('resell_start_hour', e.target.value)}
                      className="w-24 h-9 text-center text-base"
                    />
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground pb-1">:</span>
                  <div className="space-y-1.5">
                    <Label className="text-sm">分钟（0–59）</Label>
                    <Input
                      type="number" min={0} max={59}
                      value={cfg.resell_start_minute}
                      onChange={e => setField('resell_start_minute', e.target.value)}
                      className="w-24 h-9 text-center text-base"
                    />
                  </div>
                  <div className="pb-1">
                    <div className="h-9 flex items-center px-3 rounded-md bg-primary/10 text-primary font-semibold text-lg tabular-nums">
                      {displayTime}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <Info size={14} className="mt-0.5 shrink-0 text-primary" />
                  <p>修改后立即生效，买方仓库的转拍按钮将在该时间到达后自动解锁。默认值为 <strong>14:30</strong>。</p>
                </div>

                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <RefreshCw size={14} className="animate-spin" />}
                  {saving ? '保存中…' : '保存设置'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
