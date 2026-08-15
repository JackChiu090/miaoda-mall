import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { SystemSetting } from '@/types/types';

// 基本信息
const BASIC_CONFIG = [
  { key: 'platform_name',           label: '平台名称',   desc: '显示在应用页面标题与分享内容中', type: 'text' },
  { key: 'platform_intro',          label: '平台简介',   desc: '平台对外介绍文案', type: 'textarea' },
  { key: 'customer_service_phone',  label: '客服电话',   desc: '用户联系客服的电话号码', type: 'text' },
  { key: 'customer_service_wechat', label: '客服微信',   desc: '客服微信号', type: 'text' },
];

// 分润费率
const RATE_CONFIG = [
  { key: 'merchant_bonus_rate',     label: '商家分红',       desc: '订单交易完成后，交易额的1%自动发放给买单用户',     unit: '%' },
  { key: 'boss_bonus_rate',         label: '老板分红',       desc: '订单交易完成后，按比例实时结算至奖金账户',         unit: '%' },
  { key: 'voucher_reserve_rate',    label: '代金券储备',     desc: '订单交易完成后，按比例自动存入平台代金券资金池',   unit: '%' },
  { key: 'direct_referral_rate',    label: '直接奖励',       desc: '订单交易完成后，按比例直接奖励给推荐人',           unit: '%' },
];

// 业务规则
const RULE_CONFIG = [
  { key: 'resell_premium_rate',             label: '转拍固定溢价率',         desc: '每轮交易流转自动加价比例（如 0.03 = 3%）',                   unit: '%' },
  { key: 'trial_required_days',             label: '体验商家考核工作日数',   desc: '体验商家需在此工作日天数内每天完成抢购，否则视为考核不达标（默认15天）', unit: '天' },
  { key: 'trial_daily_rush_min',            label: '体验商家每日最低抢购',   desc: '体验商家工作日内至少需完成的抢购单数（默认1单）',             unit: '单' },
  { key: 'trial_daily_rush_max',            label: '体验商家每日最高抢购',   desc: '体验商家工作日内最多可完成的抢购单数（默认2单）',             unit: '单' },
  { key: 'regular_daily_rush_min',          label: '正式商家每日必须抢购',   desc: '正式商家工作日内每天必须完成的抢购单数（默认2单）',           unit: '单' },
  { key: 'voucher_pool_redeem_threshold',   label: '代金券兑换门槛',         desc: '代金券资金池累计满此金额可申请兑换实物商品',                 unit: '元' },
  { key: 'voucher_min_direct_referrals',    label: '兑换最低直推人数',       desc: '申请代金券兑换时须满足的直推人数',                          unit: '人' },
  { key: 'rush_display_hour',               label: '首页抢购展示时间',       desc: '每天从几点开始在首页显示抢购商品（0-23）',                   unit: '时' },
];

// 抢购额度规则（时间完全由「抢购管理-时段参数配置」模块决定，此处仅保留额度参数）
const RUSH_MAIN_CONFIG = [
  { key: 'rush_referral_per_unit', label: '每单所需直推人数',     desc: '直推N人可抢1单，推荐2人抢2单，推荐3人抢3单（默认1人/单）',    unit: '人' },
  { key: 'rush_max_per_day',       label: '每日抢单封顶单数',     desc: '无论推荐多少人，单日可抢单数上限（默认3单）',                  unit: '单' },
];

const SETTINGS_CONFIG = [
  ...BASIC_CONFIG.map(c => ({ ...c, type: c.type ?? 'text' })),
  ...RATE_CONFIG.map(c => ({ ...c, type: 'text' })),
  ...RULE_CONFIG.map(c => ({ ...c, type: 'text' })),
  ...RUSH_MAIN_CONFIG.map(c => ({ ...c, type: 'text' })),
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    setLoading(true);
    const { data, error } = await supabase.from('system_settings').select('*');
    if (error) { toast.error('加载失败：' + error.message); setLoading(false); return; }
    const map: Record<string, string> = {};
    (data ?? []).forEach((s: SystemSetting) => { map[s.key] = s.value; });
    setValues(map);
    setLoading(false);
  }

  useEffect(() => { loadSettings(); }, []);

  function set(key: string, val: string) { setValues(v => ({ ...v, [key]: val })); }

  async function handleSave() {
    setSaving(true);
    // 只保存有实际值的 key，避免用空字符串覆盖数据库中已存在的值
    const allKeys = SETTINGS_CONFIG.map(c => c.key);
    const upserts = allKeys
      .filter(key => values[key] !== undefined && values[key] !== null)
      .map(key => ({
        key,
        value: values[key],
        updated_at: new Date().toISOString(),
      }));
    if (upserts.length === 0) { setSaving(false); toast.error('没有可保存的参数'); return; }
    const { error } = await supabase
      .from('system_settings')
      .upsert(upserts, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(`系统设置已全部保存（${upserts.length} 项）`);
    loadSettings();
  }

  // 分润合计校验：1% + 1.5% + 0.2% + 0.3% = 3.0%
  const SPLIT_KEYS = ['merchant_bonus_rate', 'boss_bonus_rate', 'voucher_reserve_rate', 'direct_referral_rate'];
  const splitTotal = SPLIT_KEYS.reduce((sum, k) => sum + (parseFloat(values[k] ?? '0') || 0), 0);
  const splitOk = Math.abs(splitTotal - 0.03) < 0.0001;

  function renderField(cfg: { key: string; type?: string; unit?: string }) {
    if (cfg.type === 'textarea') {
      return (
        <textarea value={values[cfg.key] ?? ''} onChange={e => set(cfg.key, e.target.value)}
          className="w-full h-8 text-xs bg-muted border border-border rounded px-2 py-1 resize-none min-h-16 focus:outline-none focus:ring-1 focus:ring-primary" />
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <Input type={cfg.type === 'text' ? 'text' : 'number'} step="0.001" min={0}
          value={values[cfg.key] ?? ''}
          onChange={e => set(cfg.key, e.target.value)}
          className="h-8 text-xs bg-muted border-border w-32 font-mono px-2" />
        {cfg.unit && <span className="text-xs text-muted-foreground shrink-0">{cfg.unit}</span>}
        {cfg.unit === '%' && values[cfg.key] && (
          <span className="text-[10px] text-muted-foreground/70">= {(parseFloat(values[cfg.key]) * 100).toFixed(2)}%</span>
        )}
      </div>
    );
  }

  return (
    <AdminLayout>
      <PageHeader title="系统基础设置" description="管理平台名称、联系方式、费率及业务规则参数；市场时段参数请前往「抢购时段管理」页配置" />

      <div className="max-w-3xl space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground py-8">加载中...</p>
        ) : (
          <>
            {/* 平台信息 */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">平台基本信息</h3>
              {BASIC_CONFIG.map(cfg => (
                <div key={cfg.key} className="space-y-1.5">
                  <Label className="text-xs font-medium">{cfg.label}</Label>
                  <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                  {renderField(cfg)}
                </div>
              ))}
            </div>

            {/* 分润费率 */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">分润费率配置</h3>
              <div className="grid grid-cols-2 gap-4">
                {RATE_CONFIG.map(cfg => (
                  <div key={cfg.key} className="space-y-1.5">
                    <Label className="text-xs font-medium">{cfg.label}</Label>
                    <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                    {renderField(cfg)}
                  </div>
                ))}
              </div>
              {/* 分润合计校验 */}
              <div className={`p-3 rounded-sm border text-xs ${splitOk ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                <p className="font-medium mb-0.5">
                  {splitOk ? '✓ 分润合计' : '⚠ 分润合计'}：商家分红 + 老板分红 + 代金券储备 + 直接奖励 = {(splitTotal * 100).toFixed(3)}%
                  {!splitOk && <span className="ml-2 text-yellow-600">（建议等于 3.000%）</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">每笔成交金额将按以上比例分配。超出或不足3%请检查参数。</p>
              </div>
            </div>

            {/* 业务规则 */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">业务规则参数</h3>
              <div className="grid grid-cols-2 gap-4">
                {RULE_CONFIG.map(cfg => (
                  <div key={cfg.key} className="space-y-1.5">
                    <Label className="text-xs font-medium">{cfg.label}</Label>
                    <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                    {renderField(cfg)}
                  </div>
                ))}
              </div>
            </div>

            {/* 主场抢购规则 */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">主场抢购规则</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  工作日主场抢购时间窗口及推荐人数阶梯上限配置，修改后实时生效
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {RUSH_MAIN_CONFIG.map(cfg => (
                  <div key={cfg.key} className="space-y-1.5">
                    <Label className="text-xs font-medium">{cfg.label}</Label>
                    <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                    {renderField(cfg)}
                  </div>
                ))}
              </div>
              {/* 示例说明 */}
              <div className="p-3 rounded-sm border border-border bg-muted/40 text-xs text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground">当前规则预览</p>
                <p>
                  抢购时间：由「抢购管理 → 时段参数配置」模块统一设定，系统严格按配置时段执行
                </p>
                <p>
                  阶梯上限：直推 1 人→1 单 / 直推 2 人→2 单 / 直推 3 人→3 单，每日最多{' '}
                  <span className="font-mono text-foreground">{values['rush_max_per_day'] ?? '3'}</span> 单封顶
                </p>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="gap-2 h-9 w-full md:w-auto">
              <Save size={14} />{saving ? '保存中...' : '保存全部设置'}
            </Button>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
