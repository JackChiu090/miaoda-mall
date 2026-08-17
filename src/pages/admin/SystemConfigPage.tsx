// 系统配置 & 权限体系：运营参数 + RBAC 用户状态权限配置
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Settings, RefreshCw, Save, ShieldCheck, CheckCircle2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface SysConfig {
  id: string;
  config_key: string;
  config_value: string;
  value_type: string;
  label: string;
  description: string | null;
  group_name: string;
  sort_order: number;
}

// RBAC 权限矩阵定义：功能 -> 哪些状态可用
const RBAC_FEATURES = [
  { key: 'browse_market',   label: '浏览进货市场',    trial: true,  active: true,  eliminated: false },
  { key: 'flash_sale',      label: '参与限时进货',    trial: true,  active: true,  eliminated: false },
  { key: 'upload_voucher',  label: '上传付款凭证',    trial: true,  active: true,  eliminated: false },
  { key: 'consign',         label: '商品寄卖申请',    trial: false, active: true,  eliminated: false },
  { key: 'resell',          label: '转拍上架',        trial: false, active: true,  eliminated: false },
  { key: 'invite',          label: '招商邀请推广',    trial: false, active: true,  eliminated: false },
  { key: 'commission',      label: '查看分销奖金',    trial: true,  active: true,  eliminated: true  },
  { key: 'withdraw',        label: '申请提现',        trial: false, active: true,  eliminated: true  },
  { key: 'wallet_view',     label: '查看钱包余额',    trial: true,  active: true,  eliminated: true  },
  { key: 'team_view',       label: '查看团队数据',    trial: true,  active: true,  eliminated: false },
  { key: 'profile',         label: '个人信息管理',    trial: true,  active: true,  eliminated: true  },
];

const GROUP_LABELS: Record<string, string> = {
  assessment: '招商考核',
  elimination:'淘汰清理',
  order_split:'拆单规则',
  team_split: '拆人规则',
  general:    '通用参数',
};

export default function SystemConfigPage() {
  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [tab, setTab] = useState('params');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('system_configs')
      .select('*')
      .order('group_name')
      .order('sort_order');
    const rows = (data as SysConfig[]) ?? [];
    setConfigs(rows);
    const vals: Record<string, string> = {};
    rows.forEach(r => { vals[r.config_key] = r.config_value; });
    setEditValues(vals);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveOne(config: SysConfig) {
    setSaving(config.config_key);
    const val = editValues[config.config_key] ?? config.config_value;
    const { error } = await supabase.from('system_configs')
      .update({ config_value: val, updated_by: '管理员', updated_at: new Date().toISOString() })
      .eq('config_key', config.config_key);
    setSaving(null);
    if (error) { toast.error('保存失败'); return; }
    toast.success(`${config.label} 已更新`);
    load();
  }

  async function saveAll() {
    setBatchSaving(true);
    const updates = configs.map(c =>
      supabase.from('system_configs')
        .update({ config_value: editValues[c.config_key] ?? c.config_value, updated_by: '管理员', updated_at: new Date().toISOString() })
        .eq('config_key', c.config_key)
    );
    const results = await Promise.all(updates);
    setBatchSaving(false);
    const hasErr = results.some(r => r.error);
    if (hasErr) { toast.error('部分参数保存失败，请重试'); return; }
    toast.success('所有参数已保存');
    load();
  }

  // 按 group 分组
  const grouped = configs.reduce<Record<string, SysConfig[]>>((acc, c) => {
    (acc[c.group_name] ??= []).push(c);
    return acc;
  }, {});

  function renderConfigField(c: SysConfig) {
    const val = editValues[c.config_key] ?? c.config_value;
    if (c.value_type === 'boolean') {
      return (
        <div className="flex items-center gap-3">
          <Switch
            checked={val === 'true'}
            onCheckedChange={checked => setEditValues(prev => ({ ...prev, [c.config_key]: checked ? 'true' : 'false' }))}
          />
          <span className="text-sm text-muted-foreground">{val === 'true' ? '已开启' : '已关闭'}</span>
        </div>
      );
    }
    return (
      <Input
        type="number"
        min="0"
        step="0.01"
        value={val}
        onChange={e => setEditValues(prev => ({ ...prev, [c.config_key]: e.target.value }))}
        className="max-w-[160px]"
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="系统配置 & 权限体系"
        description="统一管理运营参数与用户状态权限，所有参数实时生效"
        action={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="params">运营参数配置</TabsTrigger>
          <TabsTrigger value="rbac">用户状态权限矩阵</TabsTrigger>
        </TabsList>

        {/* 运营参数 */}
        <TabsContent value="params" className="mt-4 space-y-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="border-b border-border px-5 py-3 bg-muted/30 flex items-center justify-between">
                  <p className="font-semibold text-foreground text-sm">{GROUP_LABELS[group] ?? group}</p>
                  <Badge variant="outline" className="text-xs">{items.length} 项</Badge>
                </div>
                <div className="divide-y divide-border">
                  {items.map(c => (
                    <div key={c.config_key} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <Label className="text-sm font-medium text-foreground">{c.label}</Label>
                        {c.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">{c.config_key}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {renderConfigField(c)}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          disabled={saving === c.config_key}
                          onClick={() => saveOne(c)}
                        >
                          {saving === c.config_key ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                          保存
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {!loading && (
            <div className="flex justify-end">
              <Button disabled={batchSaving} onClick={saveAll} className="gap-1.5">
                {batchSaving ? <><RefreshCw size={14} className="animate-spin" />保存中…</> : <><Save size={14} />一键保存所有参数</>}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* RBAC 权限矩阵 */}
        <TabsContent value="rbac" className="mt-4">
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <div className="border-b border-border px-5 py-3 bg-muted/30 flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              <p className="font-semibold text-foreground text-sm">用户状态 × 功能权限矩阵</p>
              <Badge variant="outline" className="text-xs ml-auto">只读展示，如需修改请联系开发</Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap">功能模块</th>
                  <th className="px-4 py-3 font-medium text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>体验期</span>
                      <Badge variant="default" className="text-[10px] px-1.5">trial</Badge>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>正式用户</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5">active</Badge>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>淘汰用户</span>
                      <Badge variant="destructive" className="text-[10px] px-1.5">eliminated</Badge>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RBAC_FEATURES.map(f => (
                  <tr key={f.key} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground whitespace-nowrap">{f.label}</td>
                    {(['trial', 'active', 'eliminated'] as const).map(st => (
                      <td key={st} className="px-4 py-3 text-center">
                        {f[st]
                          ? <CheckCircle2 size={16} className="text-green-600 mx-auto" />
                          : <XCircle size={16} className="text-muted-foreground/40 mx-auto" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 状态说明 */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                status: '体验期（trial）', color: 'border-primary/30 bg-primary/5',
                items: ['可浏览市场、参与进货', '可查看钱包与团队', '禁止商品寄卖、招商邀请、提现'],
              },
              {
                status: '正式用户（active）', color: 'border-green-200 bg-green-50 dark:bg-green-950/20',
                items: ['解锁全部功能权限', '可寄卖商品、邀请招商', '可申请提现'],
              },
              {
                status: '淘汰用户（eliminated）', color: 'border-destructive/20 bg-destructive/5',
                items: ['仅可查看钱包余额与明细', '仅可申请提现保留资金', '禁止交易、招商、浏览市场'],
              },
            ].map(s => (
              <div key={s.status} className={`border rounded-xl p-4 ${s.color}`}>
                <p className="text-sm font-semibold text-foreground mb-2">{s.status}</p>
                <ul className="space-y-1">
                  {s.items.map(item => (
                    <li key={item} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
