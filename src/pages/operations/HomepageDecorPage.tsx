// 首页装修管理页
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, GripVertical, Eye } from 'lucide-react';

interface HomepageBlock {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  link_path: string;
  image_url: string;
  bg_gradient: string;
  sort_order: number;
  is_active: boolean;
}

const GRADIENT_OPTIONS = [
  { label: '橙→深橙', value: 'from-primary to-secondary' },
  { label: '蓝→橙', value: 'from-accent to-primary' },
  { label: '深橙→蓝', value: 'from-secondary to-accent' },
  { label: '橙→蓝', value: 'from-primary to-accent' },
  { label: '紫→蓝', value: 'from-purple-600 to-accent' },
  { label: '绿→蓝', value: 'from-green-600 to-accent' },
];

const EMPTY: Omit<HomepageBlock, 'id'> = {
  type: 'banner', title: '', subtitle: '', link_path: '', image_url: '',
  bg_gradient: 'from-primary to-secondary', sort_order: 0, is_active: true,
};

export default function HomepageDecorPage() {
  const [blocks, setBlocks] = useState<HomepageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HomepageBlock | null>(null);
  const [form, setForm] = useState<Omit<HomepageBlock, 'id'>>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('homepage_blocks').select('*').order('sort_order');
    setBlocks(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: blocks.length + 1 });
    setOpen(true);
  }

  function openEdit(b: HomepageBlock) {
    setEditing(b);
    setForm({ type: b.type, title: b.title, subtitle: b.subtitle, link_path: b.link_path, image_url: b.image_url, bg_gradient: b.bg_gradient, sort_order: b.sort_order, is_active: b.is_active });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('请输入标题'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('homepage_blocks').update({ ...form, updated_at: new Date().toISOString() } as never).eq('id', editing.id);
      if (error) { toast.error('保存失败'); setSaving(false); return; }
      toast.success('已更新');
    } else {
      const { error } = await supabase.from('homepage_blocks').insert(form as never);
      if (error) { toast.error('创建失败'); setSaving(false); return; }
      toast.success('已创建');
    }
    setSaving(false);
    setOpen(false);
    fetch();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('homepage_blocks').delete().eq('id', id);
    if (error) { toast.error('删除失败'); return; }
    toast.success('已删除');
    fetch();
  }

  async function toggleActive(b: HomepageBlock) {
    await supabase.from('homepage_blocks').update({ is_active: !b.is_active } as never).eq('id', b.id);
    fetch();
  }

  async function moveBlock(id: string, dir: 'up' | 'down') {
    const idx = blocks.findIndex(b => b.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === blocks.length - 1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    const a = blocks[idx], b = blocks[swapIdx];
    await Promise.all([
      supabase.from('homepage_blocks').update({ sort_order: b.sort_order } as never).eq('id', a.id),
      supabase.from('homepage_blocks').update({ sort_order: a.sort_order } as never).eq('id', b.id),
    ]);
    fetch();
  }

  return (
    <AdminLayout>
      <PageHeader title="首页装修" description="配置用户端商城首页的轮播Banner内容"
        action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}><Plus size={13} />新增Banner</Button>}
      />

      {/* 预览说明 */}
      <div className="mb-4 p-3 bg-accent/10 border border-accent/20 rounded-sm text-xs text-muted-foreground flex items-center gap-2">
        <Eye size={13} className="text-accent shrink-0" />
        修改后实时生效，用户刷新首页即可看到最新配置的轮播Banner
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, idx) => (
            <div key={b.id} className={`bg-card border border-border rounded-sm p-4 flex items-center gap-4 ${!b.is_active ? 'opacity-50' : ''}`}>
              {/* 排序手柄 */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => moveBlock(b.id, 'up')} disabled={idx === 0}
                  className="text-muted-foreground disabled:opacity-30 hover:text-foreground p-0.5">
                  <GripVertical size={12} />
                </button>
                <span className="text-xs text-muted-foreground text-center">{b.sort_order}</span>
              </div>

              {/* 颜色预览 */}
              <div className={`w-10 h-10 rounded-sm bg-gradient-to-br ${b.bg_gradient} shrink-0`} />

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                <p className="text-xs text-muted-foreground truncate">{b.subtitle}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{b.link_path}</p>
              </div>

              {/* 操作 */}
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} className="scale-75" />
                <Button variant="ghost" size="sm" onClick={() => openEdit(b)} className="h-7 w-7 p-0 border border-border">
                  <Pencil size={12} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(b.id)}
                  className="h-7 w-7 p-0 border border-border text-destructive hover:bg-destructive/10">
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">暂无Banner，点击右上角新增</div>
          )}
        </div>
      )}

      {/* 编辑/新增弹窗 */}
      <Dialog open={open} onOpenChange={o => { setOpen(o); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-sm">{editing ? '编辑Banner' : '新增Banner'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">标题 *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="如：限时进货" className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">副标题</Label>
                <Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="如：精选寄卖商品 · 一键下单" className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">跳转路径（用户端路由）</Label>
                <Input value={form.link_path} onChange={e => setForm(f => ({ ...f, link_path: e.target.value }))}
                  placeholder="如：/m/rush 或 /m/market" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">背景图URL（选填，留空则显示渐变色）</Label>
                <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://..." className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">背景渐变色</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {GRADIENT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setForm(f => ({ ...f, bg_gradient: opt.value }))}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors ${form.bg_gradient === opt.value ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                      <span className={`w-4 h-4 rounded-sm bg-gradient-to-br ${opt.value}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">排序（数字越小越靠前）</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="h-8 text-xs bg-muted border-border w-24 font-mono" />
              </div>
            </div>

            {/* 预览 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">效果预览</Label>
              <div className={`relative h-20 rounded-xl overflow-hidden bg-gradient-to-br ${form.bg_gradient} flex items-center px-5 gap-3`}
                style={form.image_url ? { backgroundImage: `url(${form.image_url})`, backgroundSize: 'cover' } : {}}>
                <div>
                  <p className="text-white font-bold">{form.title || '标题'}</p>
                  <p className="text-white/80 text-xs">{form.subtitle || '副标题'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-xs text-muted-foreground">立即启用</span>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 px-4 text-xs">
                {saving ? '保存中...' : editing ? '保存修改' : '创建Banner'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
