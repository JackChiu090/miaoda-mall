// Banner 轮播管理页（后台）
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  Eye, Upload, ImagePlus, Settings2, Loader2, X,
} from 'lucide-react';

// ─────────────────────── 类型 ───────────────────────
interface Banner {
  id: string;
  image_url: string;
  title: string;
  subtitle: string;
  link_path: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}
interface BannerSettings { autoplay_interval: number; transition_duration: number; }

const EMPTY_FORM = { title: '', subtitle: '', link_path: '', sort_order: 0, is_active: true };

// ─────────────────────── 图片压缩 ───────────────────────
const MAX_BYTES = 1024 * 1024; // 1MB

async function compressImage(file: File): Promise<{ blob: Blob; compressed: boolean; finalSize: number }> {
  if (file.size <= MAX_BYTES) return { blob: file, compressed: false, finalSize: file.size };
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const MAX_DIM = 1080;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
        else       { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('压缩失败')); return; }
          if (blob.size <= MAX_BYTES || quality <= 0.3) {
            resolve({ blob, compressed: true, finalSize: blob.size });
          } else { quality -= 0.1; tryCompress(); }
        }, 'image/webp', quality);
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function safeFileName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`;
}

// ─────────────────────── 主组件 ───────────────────────
export default function BannerManagePage() {
  const [banners, setBanners]     = useState<Banner[]>([]);
  const [loading, setLoading]     = useState(true);
  const [settings, setSettings]   = useState<BannerSettings>({ autoplay_interval: 3500, transition_duration: 450 });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // 弹窗
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm]     = useState(EMPTY_FORM);

  // 图片上传
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 预览弹窗
  const [previewUrl, setPreviewUrl] = useState('');

  // ── 数据加载 ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [bRes, sRes] = await Promise.all([
      supabase.from('banners').select('*').order('sort_order'),
      supabase.from('banner_settings').select('key,value'),
    ]);
    setBanners(bRes.data ?? []);
    if (sRes.data) {
      const m: Record<string, string> = {};
      sRes.data.forEach(r => { m[r.key] = r.value; });
      setSettings({
        autoplay_interval:   Number(m['autoplay_interval']   ?? 3500),
        transition_duration: Number(m['transition_duration'] ?? 450),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── 打开新增/编辑 ──
  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sort_order: banners.length + 1 });
    setImageFile(null); setImagePreview(''); setUploadProgress(0);
    setOpen(true);
  }
  function openEdit(b: Banner) {
    setEditing(b);
    setForm({ title: b.title, subtitle: b.subtitle, link_path: b.link_path, sort_order: b.sort_order, is_active: b.is_active });
    setImageFile(null); setImagePreview(b.image_url); setUploadProgress(0);
    setOpen(true);
  }

  // ── 图片选择 ──
  const handleFileChange = async (file: File) => {
    if (!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)) {
      toast.error('仅支持 JPG/PNG/WebP/GIF/AVIF 格式'); return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // ── 上传到 Storage ──
  async function uploadToStorage(file: File): Promise<string> {
    setUploadProgress(10);
    const { blob, compressed, finalSize } = await compressImage(file);
    setUploadProgress(30);
    if (compressed) {
      toast.info(`已自动压缩，最终大小 ${(finalSize / 1024).toFixed(0)} KB`);
    }
    const fileName = safeFileName('banner');
    const uploadFile = new File([blob], fileName, { type: 'image/webp' });
    setUploadProgress(50);
    const { error } = await supabase.storage.from('banners').upload(fileName, uploadFile, {
      contentType: 'image/webp', upsert: false,
    });
    if (error) throw new Error(error.message);
    setUploadProgress(85);
    const { data } = supabase.storage.from('banners').getPublicUrl(fileName);
    setUploadProgress(100);
    return data.publicUrl;
  }

  // ── 保存 ──
  async function handleSave() {
    setUploading(true);
    try {
      let imageUrl = editing?.image_url ?? '';
      if (imageFile) {
        imageUrl = await uploadToStorage(imageFile);
      }
      if (!imageUrl) { toast.error('请上传 Banner 图片'); return; }

      const payload = {
        ...form,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('banners').update(payload as never).eq('id', editing.id);
        if (error) { toast.error('保存失败：' + error.message); return; }
        toast.success('Banner 已更新');
      } else {
        const { error } = await supabase.from('banners').insert(payload as never);
        if (error) { toast.error('创建失败：' + error.message); return; }
        toast.success('Banner 已创建');
      }
      setOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error('操作失败：' + e.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // ── 删除 ──
  async function handleDelete(id: string, imageUrl: string) {
    const { error } = await supabase.from('banners').delete().eq('id', id);
    if (error) { toast.error('删除失败'); return; }
    // 尝试删除 Storage 文件
    if (imageUrl) {
      const parts = imageUrl.split('/banners/');
      if (parts.length === 2) {
        await supabase.storage.from('banners').remove([parts[1]]);
      }
    }
    toast.success('已删除');
    fetchAll();
  }

  // ── 启用/禁用 ──
  async function toggleActive(b: Banner) {
    await supabase.from('banners').update({ is_active: !b.is_active } as never).eq('id', b.id);
    fetchAll();
  }

  // ── 排序 ──
  async function moveItem(id: string, dir: 'up' | 'down') {
    const idx = banners.findIndex(b => b.id === id);
    if (dir === 'up'   && idx === 0)               return;
    if (dir === 'down' && idx === banners.length - 1) return;
    const si = dir === 'up' ? idx - 1 : idx + 1;
    const a = banners[idx], b = banners[si];
    await Promise.all([
      supabase.from('banners').update({ sort_order: b.sort_order } as never).eq('id', a.id),
      supabase.from('banners').update({ sort_order: a.sort_order } as never).eq('id', b.id),
    ]);
    fetchAll();
  }

  // ── 保存播放配置 ──
  async function saveSettings() {
    setSettingsLoading(true);
    await Promise.all([
      supabase.from('banner_settings').upsert({ key: 'autoplay_interval',   value: String(settings.autoplay_interval) }),
      supabase.from('banner_settings').upsert({ key: 'transition_duration', value: String(settings.transition_duration) }),
    ]);
    setSettingsLoading(false);
    toast.success('播放配置已保存');
  }

  // ── 拖放上传 ──
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Banner 轮播管理"
        description="配置前端首页轮播 Banner：上传图片、调整顺序、设置播放速度"
        action={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
            <Plus size={13} />新增 Banner
          </Button>
        }
      />

      {/* 说明栏 */}
      <div className="mb-5 p-3 bg-primary/5 border border-primary/20 rounded-sm text-xs text-muted-foreground flex items-center gap-2">
        <Eye size={13} className="text-primary shrink-0" />
        保存后实时生效，用户刷新首页即可看到最新 Banner；推荐图片宽高比 16:7（如 1600×700px）
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── 左：Banner 列表 ── */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />加载中...
            </div>
          ) : banners.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground border border-dashed border-border rounded-sm">
              暂无 Banner，点击右上角「新增 Banner」开始添加
            </div>
          ) : (
            banners.map((b, idx) => (
              <div key={b.id}
                className={`bg-card border border-border rounded-sm flex gap-3 p-3 items-center ${!b.is_active ? 'opacity-50' : ''}`}>

                {/* 排序按钮 */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveItem(b.id, 'up')} disabled={idx === 0}
                    className="p-0.5 text-muted-foreground disabled:opacity-20 hover:text-foreground transition-colors">
                    <ChevronUp size={14} />
                  </button>
                  <span className="text-[10px] text-muted-foreground text-center font-mono">{idx + 1}</span>
                  <button onClick={() => moveItem(b.id, 'down')} disabled={idx === banners.length - 1}
                    className="p-0.5 text-muted-foreground disabled:opacity-20 hover:text-foreground transition-colors">
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* 缩略图 */}
                <button
                  className="w-20 h-12 rounded-sm overflow-hidden bg-muted shrink-0 border border-border hover:opacity-80 transition-opacity"
                  onClick={() => setPreviewUrl(b.image_url)}
                  title="点击预览"
                >
                  {b.image_url
                    ? <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><ImagePlus size={16} className="text-muted-foreground" /></div>
                  }
                </button>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{b.title || '（无标题）'}</p>
                    <Badge variant={b.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 h-4 shrink-0">
                      {b.is_active ? '启用' : '禁用'}
                    </Badge>
                  </div>
                  {b.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.subtitle}</p>}
                  {b.link_path && <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{b.link_path}</p>}
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} className="scale-75" />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(b)}
                    className="h-7 w-7 p-0 border border-border">
                    <Pencil size={12} />
                  </Button>
                  <Button variant="ghost" size="sm"
                    onClick={() => { if (confirm('确认删除此 Banner？')) handleDelete(b.id, b.image_url); }}
                    className="h-7 w-7 p-0 border border-border text-destructive hover:bg-destructive/10">
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 右：播放配置 ── */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-sm p-4 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Settings2 size={14} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">播放配置</h3>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                自动播放间隔
                <span className="text-foreground font-medium ml-1">{(settings.autoplay_interval / 1000).toFixed(1)}s</span>
              </Label>
              <input
                type="range" min={1000} max={8000} step={500}
                value={settings.autoplay_interval}
                onChange={e => setSettings(s => ({ ...s, autoplay_interval: Number(e.target.value) }))}
                className="w-full accent-primary h-1.5"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1s（快）</span><span>8s（慢）</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                切换动画时长
                <span className="text-foreground font-medium ml-1">{settings.transition_duration}ms</span>
              </Label>
              <input
                type="range" min={200} max={1000} step={50}
                value={settings.transition_duration}
                onChange={e => setSettings(s => ({ ...s, transition_duration: Number(e.target.value) }))}
                className="w-full accent-primary h-1.5"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>200ms（快）</span><span>1000ms（慢）</span>
              </div>
            </div>

            <Button size="sm" className="w-full h-8 text-xs" onClick={saveSettings} disabled={settingsLoading}>
              {settingsLoading ? '保存中...' : '保存播放配置'}
            </Button>
          </div>

          {/* 使用说明 */}
          <div className="bg-muted/40 rounded-sm p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground">使用说明</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>推荐图片宽高比 <strong>16:7</strong>，分辨率 1600×700px</li>
              <li>支持 JPG / PNG / WebP，超 1MB 自动压缩</li>
              <li>拖拽排序后立即生效</li>
              <li>禁用状态的 Banner 不会在前端展示</li>
              <li>鼠标悬停轮播时自动暂停播放</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── 新增/编辑弹窗 ── */}
      <Dialog open={open} onOpenChange={o => { if (!uploading) setOpen(o); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{editing ? '编辑 Banner' : '新增 Banner'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            {/* 图片上传区 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Banner 图片 *</Label>
              <div
                className="relative w-full aspect-[16/7] rounded-lg border-2 border-dashed border-border overflow-hidden bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2"
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="预览" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-medium">点击重新选择</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload size={22} className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground text-center">点击上传或拖拽图片到此区域</p>
                    <p className="text-[10px] text-muted-foreground/70">JPG/PNG/WebP，超 1MB 自动压缩至 WebP</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef} type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); e.target.value = ''; }}
              />
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">上传中 {uploadProgress}%...</p>
                </div>
              )}
            </div>

            {/* 表单字段 */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">标题（选填，会叠加在图片上）</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="如：限时进货，精选好货" className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">副标题（选填）</Label>
                <Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="如：精选寄卖商品 · 一键下单" className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">点击跳转路径（选填）</Label>
                <Input value={form.link_path} onChange={e => setForm(f => ({ ...f, link_path: e.target.value }))}
                  placeholder="如：/m/rush 或 /m/market" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">排序（数字越小越靠前）</Label>
                <Input type="number" value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="h-8 text-xs bg-muted border-border w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <span className="text-xs text-muted-foreground">立即启用（禁用则不在前端显示）</span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={uploading}
                className="h-8 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} disabled={uploading} className="h-8 px-4 text-xs">
                {uploading ? (
                  <><Loader2 size={12} className="animate-spin mr-1.5" />上传中...</>
                ) : editing ? '保存修改' : '创建 Banner'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 图片预览弹窗 ── */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl('')}
        >
          <button className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
            <X size={16} />
          </button>
          <img src={previewUrl} alt="Banner 预览" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />
        </div>
      )}
    </AdminLayout>
  );
}
