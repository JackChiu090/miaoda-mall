// 前端页面设计器
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  ChevronUp, ChevronDown, Eye, EyeOff, Save, RefreshCw,
  Smartphone, LayoutDashboard, Image, Navigation, Megaphone,
  Zap, Star, Coins, LogIn, Settings2, GripVertical, Check,
} from 'lucide-react';

// ─────────────────── 类型 ───────────────────
interface PageSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string;
  is_visible: boolean;
  sort_order: number;
  config: Record<string, unknown>;
  updated_at: string;
}

// ─────────────────── 区块元数据 ───────────────────
const SECTION_META: Record<string, {
  icon: React.ElementType;
  label: string;
  color: string;
  configFields?: { key: string; label: string; type: 'number' | 'text' | 'color'; min?: number; max?: number }[];
}> = {
  banner_carousel: {
    icon: Image, label: 'Banner轮播', color: 'bg-blue-500/10 text-blue-600 border-blue-200',
    configFields: [{ key: 'max_count', label: '最多显示数量', type: 'number', min: 1, max: 10 }],
  },
  quick_nav: {
    icon: Navigation, label: '快捷入口', color: 'bg-purple-500/10 text-purple-600 border-purple-200',
  },
  announcements: {
    icon: Megaphone, label: '平台公告', color: 'bg-orange-500/10 text-orange-600 border-orange-200',
    configFields: [{ key: 'max_count', label: '最多显示条数', type: 'number', min: 1, max: 10 }],
  },
  activities: {
    icon: Zap, label: '近期活动', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
    configFields: [{ key: 'max_count', label: '最多显示条数', type: 'number', min: 1, max: 10 }],
  },
  featured_products: {
    icon: Star, label: '甄选新品', color: 'bg-pink-500/10 text-pink-600 border-pink-200',
    configFields: [
      { key: 'max_count', label: '最多显示商品数', type: 'number', min: 2, max: 12 },
      { key: 'cols', label: '每行列数', type: 'number', min: 1, max: 3 },
    ],
  },
  exchange_zone: {
    icon: Coins, label: '代金券兑换专区', color: 'bg-amber-500/10 text-amber-600 border-amber-200',
    configFields: [{ key: 'max_count', label: '商品预览数量', type: 'number', min: 2, max: 8 }],
  },
  login_guide: {
    icon: LogIn, label: '登录引导条', color: 'bg-green-500/10 text-green-600 border-green-200',
  },
};

// ─────────────────── 手机预览子组件 ───────────────────
function PhonePreview({ sections }: { sections: PageSection[] }) {
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order).filter(s => s.is_visible);

  return (
    <div className="flex flex-col items-center">
      {/* 手机外壳 */}
      <div className="relative bg-card border-2 border-border rounded-[2.5rem] shadow-xl overflow-hidden"
        style={{ width: 220, minHeight: 460 }}>
        {/* 刘海 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-card border-b border-border rounded-b-xl z-10" />
        {/* 屏幕内容 */}
        <div className="mt-4 overflow-y-auto bg-background" style={{ height: 440 }}>
          {/* 顶栏 */}
          <div className="bg-[#df2828] px-3 pt-3 pb-2.5">
            <p className="text-[8px] text-white/80">你好，用户 👋</p>
            <p className="text-[11px] font-bold text-white">众泰商城</p>
          </div>
          {/* 区块渲染 */}
          {sorted.map(s => {
            const meta = SECTION_META[s.section_key];
            const Icon = meta?.icon ?? LayoutDashboard;
            switch (s.section_key) {
              case 'banner_carousel':
                return (
                  <div key={s.id} className="mx-2 mt-2 h-14 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center px-3 gap-2">
                    <div>
                      <p className="text-[8px] font-bold text-white">限时抢单</p>
                      <p className="text-[6px] text-white/70">精选好货</p>
                    </div>
                    <div className="ml-auto flex gap-0.5">
                      {[0,1,2].map(i => <div key={i} className={`h-1 rounded-full ${i===0?'w-3 bg-white':'w-1 bg-white/40'}`}/>)}
                    </div>
                  </div>
                );
              case 'quick_nav':
                return (
                  <div key={s.id} className="mx-2 mt-2 bg-card border border-border rounded-xl p-2 grid grid-cols-4 gap-1">
                    {['进货市场','限时抢单','代金券兑换','我的订单'].map(label => (
                      <div key={label} className="flex flex-col items-center gap-0.5">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon size={9} className="text-primary" />
                        </div>
                        <span className="text-[5px] text-muted-foreground text-center leading-tight">{label}</span>
                      </div>
                    ))}
                  </div>
                );
              case 'announcements':
                return (
                  <div key={s.id} className="mx-2 mt-2 bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
                      <Megaphone size={8} className="text-primary" />
                      <span className="text-[8px] font-semibold">平台公告</span>
                    </div>
                    {[1,2].map(i => (
                      <div key={i} className="px-2 py-1.5 border-b border-border last:border-0 flex items-center gap-1">
                        <div className="w-6 h-2.5 bg-border rounded" />
                        <div className="flex-1 h-2 bg-muted rounded" />
                      </div>
                    ))}
                  </div>
                );
              case 'activities':
                return (
                  <div key={s.id} className="mx-2 mt-2 bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-2 py-1.5 flex items-center gap-1">
                      <Zap size={8} className="text-yellow-500" />
                      <div className="flex-1 h-2 bg-muted rounded" />
                      <div className="w-8 h-3 bg-primary/20 rounded-full" />
                    </div>
                  </div>
                );
              case 'featured_products': {
                const cols = Number((s.config as any).cols ?? 2);
                const count = Math.min(Number((s.config as any).max_count ?? 4), 6);
                return (
                  <div key={s.id} className="mx-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Star size={8} className="text-primary" />
                      <span className="text-[8px] font-semibold">甄选新品</span>
                    </div>
                    <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                      {Array.from({ length: Math.min(count, cols * 2) }).map((_, i) => (
                        <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                          <div className="aspect-square bg-muted" />
                          <div className="p-1 space-y-0.5">
                            <div className="h-2 bg-muted rounded w-full" />
                            <div className="h-2 bg-primary/20 rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              case 'exchange_zone':
                return (
                  <div key={s.id} className="mx-2 mt-2 rounded-xl overflow-hidden border border-border">
                    <div className="h-10 bg-gradient-to-r from-amber-600 to-yellow-500 flex items-center px-2 gap-1">
                      <Coins size={9} className="text-yellow-200" />
                      <span className="text-[8px] font-bold text-white">代金券兑换专区</span>
                    </div>
                    <div className="grid grid-cols-4 bg-card">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex flex-col items-center p-1.5 gap-0.5">
                          <div className="w-full aspect-square bg-muted rounded" />
                          <div className="h-1.5 bg-muted rounded w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              case 'login_guide':
                return (
                  <div key={s.id} className="mx-2 mt-2 bg-primary/10 border border-primary/30 rounded-xl p-2 flex items-center justify-between">
                    <div>
                      <div className="h-2 bg-foreground/20 rounded w-20 mb-1" />
                      <div className="h-1.5 bg-muted rounded w-14" />
                    </div>
                    <div className="h-5 w-12 bg-primary rounded-md" />
                  </div>
                );
              default:
                return null;
            }
          })}
          <div className="h-16" />
          {/* 底部Tab模拟 */}
          <div className="sticky bottom-0 bg-card border-t border-border flex justify-around py-1.5 px-2">
            {['首页','进货','钱包','我的'].map(t => (
              <div key={t} className="flex flex-col items-center gap-0.5">
                <div className={`w-3 h-3 rounded ${t==='首页'?'bg-primary':'bg-muted'}`}/>
                <span className={`text-[5px] ${t==='首页'?'text-primary':'text-muted-foreground'}`}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">实时预览</p>
    </div>
  );
}

// ─────────────────── 属性编辑面板 ───────────────────
interface PropsPanelProps {
  section: PageSection | null;
  onChange: (updated: PageSection) => void;
  onSave: (section: PageSection) => void;
  saving: boolean;
}

function PropsPanel({ section, onChange, onSave, saving }: PropsPanelProps) {
  if (!section) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
        <Settings2 size={32} className="opacity-30" />
        <p className="text-sm">选择左侧区块以编辑属性</p>
      </div>
    );
  }
  const meta = SECTION_META[section.section_key];

  function setField<K extends keyof PageSection>(key: K, val: PageSection[K]) {
    onChange({ ...section!, [key]: val });
  }
  function setConfig(key: string, val: unknown) {
    onChange({ ...section!, config: { ...section!.config, [key]: val } });
  }

  return (
    <div className="space-y-5 p-4">
      {/* 区块标识 */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        {meta && <meta.icon size={16} className="text-primary shrink-0" />}
        <div>
          <p className="text-sm font-semibold text-foreground">{meta?.label ?? section.section_key}</p>
          <p className="text-xs text-muted-foreground">{section.section_key}</p>
        </div>
        <div className="ml-auto">
          <Badge variant={section.is_visible ? 'default' : 'secondary'} className="text-[10px]">
            {section.is_visible ? '显示中' : '已隐藏'}
          </Badge>
        </div>
      </div>

      {/* 显示/隐藏 */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">显示此区块</Label>
        <Switch checked={section.is_visible} onCheckedChange={v => setField('is_visible', v)} />
      </div>

      {/* 标题 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">区块标题</Label>
        <Input value={section.title} onChange={e => setField('title', e.target.value)}
          className="h-8 text-xs bg-muted border-border" placeholder="区块标题" />
      </div>

      {/* 副标题 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">说明文字</Label>
        <Textarea value={section.subtitle} onChange={e => setField('subtitle', e.target.value)}
          className="text-xs bg-muted border-border resize-none" rows={2} placeholder="区块说明（可选）" />
      </div>

      {/* 自定义配置字段 */}
      {meta?.configFields && meta.configFields.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-border">
          <p className="text-xs font-medium text-foreground">高级配置</p>
          {meta.configFields.map(field => {
            const val = section.config[field.key] as number | string ?? (field.type === 'number' ? field.min ?? 1 : '');
            return (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {field.type === 'number' && (
                    <span className="text-xs font-mono font-medium text-foreground">{val}</span>
                  )}
                </div>
                {field.type === 'number' ? (
                  <Slider
                    value={[Number(val)]}
                    min={field.min ?? 1}
                    max={field.max ?? 10}
                    step={1}
                    onValueChange={([v]) => setConfig(field.key, v)}
                    className="w-full"
                  />
                ) : (
                  <Input value={String(val)} onChange={e => setConfig(field.key, e.target.value)}
                    className="h-8 text-xs bg-muted border-border" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 保存 */}
      <div className="pt-4 border-t border-border">
        <Button className="w-full h-8 text-xs gap-1.5" onClick={() => onSave(section)} disabled={saving}>
          {saving ? <><RefreshCw size={12} className="animate-spin" />保存中...</> : <><Save size={12} />保存修改</>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────── 主页面 ───────────────────
export default function PageDesignerPage() {
  const [sections, setSections] = useState<PageSection[]>([]);
  const [localSections, setLocalSections] = useState<PageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PageSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('page_sections').select('*').order('sort_order');
    const list = (data ?? []) as PageSection[];
    setSections(list);
    setLocalSections(list);
    setSelected(prev => prev ? list.find(s => s.id === prev.id) ?? null : null);
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  // 本地排序
  async function moveSection(id: string, dir: 'up' | 'down') {
    const idx = localSections.findIndex(s => s.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === localSections.length - 1) return;
    const si = dir === 'up' ? idx - 1 : idx + 1;
    const next = [...localSections];
    const [a, b] = [next[idx], next[si]];
    // 互换 sort_order
    [next[idx], next[si]] = [{ ...b, sort_order: a.sort_order }, { ...a, sort_order: b.sort_order }];
    setLocalSections(next);
    setDirty(true);
    // 同步 selected
    if (selected?.id === id) setSelected(next[si]);
  }

  // 更新单个区块（本地）
  function handleSectionChange(updated: PageSection) {
    setLocalSections(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
    setDirty(true);
  }

  // 保存单个区块
  async function saveSingle(section: PageSection) {
    setSaving(true);
    const { error } = await supabase.from('page_sections').update({
      title: section.title,
      subtitle: section.subtitle,
      is_visible: section.is_visible,
      sort_order: section.sort_order,
      config: section.config,
      updated_at: new Date().toISOString(),
    }).eq('id', section.id);
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(`「${SECTION_META[section.section_key]?.label ?? section.section_key}」已保存`);
    // 同步到 sections 源
    setSections(prev => prev.map(s => s.id === section.id ? section : s));
    setDirty(localSections.some(s => s.id !== section.id && JSON.stringify(s) !== JSON.stringify(sections.find(o => o.id === s.id))));
  }

  // 一键保存所有更改
  async function saveAll() {
    setSavingAll(true);
    try {
      await Promise.all(localSections.map(s =>
        supabase.from('page_sections').update({
          title: s.title, subtitle: s.subtitle, is_visible: s.is_visible,
          sort_order: s.sort_order, config: s.config, updated_at: new Date().toISOString(),
        }).eq('id', s.id)
      ));
      toast.success('所有区块配置已保存，用户端刷新后生效');
      setSections([...localSections]);
      setDirty(false);
    } catch {
      toast.error('保存失败，请重试');
    }
    setSavingAll(false);
  }

  const sorted = [...localSections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <AdminLayout>
      <PageHeader
        title="前端页面设计"
        description="配置用户端首页各区块的显示状态、顺序和内容"
        action={
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-sm">
                有未保存的更改
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={fetchSections}
              className="h-8 gap-1.5 text-xs border border-border">
              <RefreshCw size={13} />重置
            </Button>
            <Button size="sm" onClick={saveAll} disabled={savingAll || !dirty}
              className="h-8 gap-1.5 text-xs">
              {savingAll ? <><RefreshCw size={12} className="animate-spin" />保存中</> : <><Check size={12} />发布全部</>}
            </Button>
          </div>
        }
      />

      {/* 提示栏 */}
      <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-sm text-xs text-muted-foreground flex items-center gap-2">
        <Eye size={13} className="text-primary shrink-0" />
        调整区块顺序和配置后，点击「发布全部」即可实时同步到用户端首页
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw size={16} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* ── 左：区块列表 ── */}
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <LayoutDashboard size={14} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">页面区块</h3>
              <span className="text-xs text-muted-foreground ml-auto">{sorted.filter(s => s.is_visible).length} / {sorted.length} 显示</span>
            </div>
            {sorted.map((section, idx) => {
              const meta = SECTION_META[section.section_key];
              const Icon = meta?.icon ?? LayoutDashboard;
              const isSelected = selected?.id === section.id;
              return (
                <div
                  key={section.id}
                  onClick={() => setSelected(localSections.find(s => s.id === section.id) ?? section)}
                  className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-all
                    ${isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'}
                    ${!section.is_visible ? 'opacity-50' : ''}`}
                >
                  {/* 排序按钮 */}
                  <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => moveSection(section.id, 'up')} disabled={idx === 0}
                      className="p-0.5 text-muted-foreground disabled:opacity-20 hover:text-foreground transition-colors">
                      <ChevronUp size={13} />
                    </button>
                    <span className="text-[10px] text-muted-foreground text-center font-mono">{idx + 1}</span>
                    <button onClick={() => moveSection(section.id, 'down')} disabled={idx === sorted.length - 1}
                      className="p-0.5 text-muted-foreground disabled:opacity-20 hover:text-foreground transition-colors">
                      <ChevronDown size={13} />
                    </button>
                  </div>

                  {/* 图标 */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${meta?.color ?? 'bg-muted text-muted-foreground border-border'}`}>
                    <Icon size={15} />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{section.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{section.subtitle}</p>
                  </div>

                  {/* 状态 + 开关 */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {section.is_visible
                      ? <Eye size={13} className="text-primary" />
                      : <EyeOff size={13} className="text-muted-foreground" />}
                    <Switch
                      checked={section.is_visible}
                      onCheckedChange={v => {
                        const updated = { ...section, is_visible: v };
                        handleSectionChange(updated);
                      }}
                      className="scale-75"
                    />
                  </div>
                </div>
              );
            })}

            {/* 拖拽提示 */}
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/60">
              <GripVertical size={11} />
              点击行可选中编辑，使用上下箭头调整排序
            </div>
          </div>

          {/* ── 中：手机预览 ── */}
          <div className="lg:col-span-3 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3 self-start">
              <Smartphone size={14} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">实时预览</h3>
            </div>
            <PhonePreview sections={localSections} />
          </div>

          {/* ── 右：属性编辑器 ── */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings2 size={14} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">属性编辑</h3>
            </div>
            <div className="bg-card border border-border rounded-sm min-h-64">
              <PropsPanel
                section={selected}
                onChange={handleSectionChange}
                onSave={saveSingle}
                saving={saving}
              />
            </div>
          </div>

        </div>
      )}
    </AdminLayout>
  );
}
