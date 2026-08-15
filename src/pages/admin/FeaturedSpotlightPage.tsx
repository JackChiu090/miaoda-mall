// 甄选单品·焦点展示管理：配置首页精选商品展示卡片
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Star, Plus, Pencil, Trash2, RefreshCw, ImagePlus,
  Eye, EyeOff, Clock, Package, X, GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface Spotlight {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  highlights: string[];
  price: number;
  original_price: number | null;
  image_url: string | null;
  tags: string[];
  product_id: string | null;
  cta_text: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const EMPTY: Omit<Spotlight, 'id' | 'created_at'> = {
  title: '',
  subtitle: '',
  description: '',
  highlights: [],
  price: 0,
  original_price: null,
  image_url: null,
  tags: [],
  product_id: null,
  cta_text: '立即购买',
  start_time: null,
  end_time: null,
  is_active: true,
  sort_order: 0,
};

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}
function fromLocalDatetimeValue(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

export default function FeaturedSpotlightPage() {
  const [list, setList] = useState<Spotlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Spotlight, 'id' | 'created_at'>>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [highlightInput, setHighlightInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('featured_spotlight')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    setList((data as Spotlight[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setHighlightInput('');
    setTagInput('');
    setOpen(true);
  }

  function openEdit(s: Spotlight) {
    setEditId(s.id);
    setForm({
      title: s.title,
      subtitle: s.subtitle ?? '',
      description: s.description ?? '',
      highlights: s.highlights ?? [],
      price: s.price,
      original_price: s.original_price,
      image_url: s.image_url,
      tags: s.tags ?? [],
      product_id: s.product_id,
      cta_text: s.cta_text,
      start_time: s.start_time,
      end_time: s.end_time,
      is_active: s.is_active,
      sort_order: s.sort_order,
    });
    setHighlightInput('');
    setTagInput('');
    setOpen(true);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `spotlight/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      setForm(f => ({ ...f, image_url: publicUrl }));
      toast.success('图片上传成功');
    } catch {
      toast.error('图片上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  function addHighlight() {
    const v = highlightInput.trim();
    if (!v) return;
    setForm(f => ({ ...f, highlights: [...f.highlights, v] }));
    setHighlightInput('');
  }

  function removeHighlight(i: number) {
    setForm(f => ({ ...f, highlights: f.highlights.filter((_, idx) => idx !== i) }));
  }

  function addTag() {
    const v = tagInput.trim();
    if (!v) return;
    setForm(f => ({ ...f, tags: [...f.tags, v] }));
    setTagInput('');
  }

  function removeTag(i: number) {
    setForm(f => ({ ...f, tags: f.tags.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('请填写商品名称'); return; }
    if (form.price <= 0) { toast.error('请填写正确的价格'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        subtitle: form.subtitle || null,
        description: form.description || null,
        original_price: form.original_price || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from('featured_spotlight').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('已更新');
      } else {
        const { error } = await supabase.from('featured_spotlight').insert(payload);
        if (error) throw error;
        toast.success('已创建');
      }
      setOpen(false);
      load();
    } catch {
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('featured_spotlight').delete().eq('id', deleteTarget);
    if (error) { toast.error('删除失败'); return; }
    toast.success('已删除');
    setDeleteTarget(null);
    load();
  }

  async function toggleActive(s: Spotlight) {
    await supabase.from('featured_spotlight').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  }

  function getStatus(s: Spotlight): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    if (!s.is_active) return { label: '已下架', variant: 'secondary' };
    const now = Date.now();
    if (s.start_time && new Date(s.start_time).getTime() > now) return { label: '未开始', variant: 'outline' };
    if (s.end_time && new Date(s.end_time).getTime() < now) return { label: '已过期', variant: 'destructive' };
    return { label: '展示中', variant: 'default' };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="甄选单品展示"
        description="配置会员首页甄选新品板块下的精选单品焦点展示卡片"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-1" />刷新</Button>
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />新增单品</Button>
          </div>
        }
      />

      {/* 列表 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Star size={40} className="opacity-30" />
            <p className="text-sm">暂无单品展示，点击「新增单品」开始配置</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map(s => {
            const status = getStatus(s);
            return (
              <Card key={s.id} className="overflow-hidden">
                <div className="flex gap-0">
                  {/* 图片预览 */}
                  <div className="w-32 h-40 shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                    {s.image_url
                      ? <img src={s.image_url} alt={s.title} className="w-full h-full object-cover" />
                      : <Package size={28} className="text-muted-foreground/40" />}
                  </div>
                  {/* 内容 */}
                  <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                          {s.tags.map(t => (
                            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                        <p className="font-semibold text-foreground text-sm leading-tight line-clamp-2">{s.title}</p>
                        {s.subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.subtitle}</p>}
                      </div>
                      <GripVertical size={14} className="text-muted-foreground/40 shrink-0 mt-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold text-base">¥{Number(s.price).toLocaleString()}</span>
                      {s.original_price && (
                        <span className="text-xs text-muted-foreground line-through">¥{Number(s.original_price).toLocaleString()}</span>
                      )}
                    </div>
                    {s.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.highlights.slice(0, 3).map((h, i) => (
                          <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{h}</span>
                        ))}
                      </div>
                    )}
                    {(s.start_time || s.end_time) && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock size={10} />
                        <span>
                          {s.start_time ? new Date(s.start_time).toLocaleDateString('zh-CN') : '立即'}
                          {' → '}
                          {s.end_time ? new Date(s.end_time).toLocaleDateString('zh-CN') : '长期'}
                        </span>
                      </div>
                    )}
                    {/* 操作 */}
                    <div className="flex items-center gap-2 mt-auto">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(s)}>
                        <Pencil size={11} className="mr-1" />编辑
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => toggleActive(s)}
                      >
                        {s.is_active ? <><EyeOff size={11} className="mr-1" />下架</> : <><Eye size={11} className="mr-1" />上架</>}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(s.id)}
                      >
                        <Trash2 size={11} />
                      </Button>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">排序</span>
                        <span className="text-[10px] font-medium">{s.sort_order}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新增/编辑 Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? '编辑单品展示' : '新增单品展示'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 图片上传 */}
            <div className="space-y-2">
              <Label>商品主图</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
              />
              <div
                className="relative w-full aspect-[16/9] rounded-xl border-2 border-dashed border-border bg-muted overflow-hidden cursor-pointer hover:border-primary/50 transition-colors flex items-center justify-center"
                onClick={() => fileRef.current?.click()}
              >
                {form.image_url ? (
                  <>
                    <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-sm font-medium">点击更换图片</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImagePlus size={32} className={uploading ? 'animate-pulse' : ''} />
                    <span className="text-sm">{uploading ? '上传中...' : '点击上传商品主图'}</span>
                    <span className="text-xs">建议尺寸 800×600，JPG/PNG/WEBP</span>
                  </div>
                )}
              </div>
            </div>

            {/* 基本信息 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>商品名称 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="请输入商品名称"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>简介副标题</Label>
                <Input
                  placeholder="一句话简介"
                  value={form.subtitle ?? ''}
                  onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>商品描述</Label>
              <Textarea
                placeholder="商品详细描述（可选）"
                rows={3}
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* 价格 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>展示价格 <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min={0} step={0.01}
                  placeholder="0.00"
                  value={form.price || ''}
                  onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>划线原价（可选）</Label>
                <Input
                  type="number" min={0} step={0.01}
                  placeholder="0.00"
                  value={form.original_price ?? ''}
                  onChange={e => setForm(f => ({ ...f, original_price: parseFloat(e.target.value) || null }))}
                />
              </div>
            </div>

            {/* 亮点 */}
            <div className="space-y-2">
              <Label>商品亮点/卖点</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入亮点，按回车添加"
                  value={highlightInput}
                  onChange={e => setHighlightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHighlight(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addHighlight} className="shrink-0">添加</Button>
              </div>
              {form.highlights.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.highlights.map((h, i) => (
                    <span key={i} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                      {h}
                      <button onClick={() => removeHighlight(i)} className="hover:text-destructive"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 标签 */}
            <div className="space-y-2">
              <Label>商品标签（如"新品"、"热销"）</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入标签，按回车添加"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag} className="shrink-0">添加</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.tags.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">
                      {t}
                      <button onClick={() => removeTag(i)} className="hover:text-destructive"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 按钮文字 & 排序 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>按钮文字</Label>
                <Input
                  placeholder="立即购买"
                  value={form.cta_text}
                  onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>排序值（越小越靠前）</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* 展示时间 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始展示时间（可选）</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetimeValue(form.start_time)}
                  onChange={e => setForm(f => ({ ...f, start_time: fromLocalDatetimeValue(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>结束展示时间（可选）</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetimeValue(form.end_time)}
                  onChange={e => setForm(f => ({ ...f, end_time: fromLocalDatetimeValue(e.target.value) }))}
                />
              </div>
            </div>

            {/* 状态开关 */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <div>
                <p className="text-sm font-medium">立即上架</p>
                <p className="text-xs text-muted-foreground">关闭后保存为草稿，不在前端展示</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，确认要删除这条单品展示吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
