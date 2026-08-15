import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Eye, Plus, X, Upload } from 'lucide-react';
import { uploadProductImage } from '@/utils/imageUpload';
import type { Product, ProductCategory } from '@/types/types';

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  title: '',
  description: '',
  category_id: '',
  original_price: '',
  consignment_price: '',
  generation: '1',
  condition: '全新',
  specsText: '',  // "品牌: Apple\n型号: iPhone 15 Pro" 格式
};

const CONDITIONS = ['全新', '99新', '9.5新', '9新', '8.5新', '8新', '7新', '其他'];

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  // 新增商品状态
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase
      .from('products')
      .select('*, seller:seller_id(phone,nickname), category:category_id(name)', { count: 'exact' });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  async function fetchCategories() {
    const { data } = await supabase.from('product_categories').select('*').eq('is_active', true).order('sort_order');
    setCategories(data ?? []);
  }

  useEffect(() => { fetchItems(); }, [page, statusFilter, search]);
  useEffect(() => { fetchCategories(); }, []);

  async function handleApprove(item: Product) {
    const { error } = await supabase.from('products').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('商品已通过审核，上架成功');
    fetchItems();
  }

  async function confirmReject() {
    if (!selected) return;
    const { error } = await supabase.from('products')
      .update({ status: 'rejected', reject_reason: rejectReason || '不符合上架要求', reviewed_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已拒绝商品审核');
    setRejectOpen(false);
    fetchItems();
  }

  async function handleWithdraw(item: Product) {
    const { error } = await supabase.from('products').update({ status: 'withdrawn' }).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('商品已下架');
    fetchItems();
  }

  // 管理员新增商品
  async function handleCreate() {
    if (!form.title.trim()) { toast.error('请输入商品名称'); return; }
    if (!form.consignment_price || isNaN(Number(form.consignment_price))) { toast.error('请输入有效价格'); return; }
    if (images.length === 0) { toast.error('请至少添加一张商品图片'); return; }
    setCreating(true);
    const price = Number(form.consignment_price);
    const origPrice = form.original_price ? Number(form.original_price) : price;
    // 解析规格参数：每行 "键: 值" 格式
    const specs: Record<string, string> = {};
    form.specsText.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) specs[k] = v;
      }
    });
    // 手动添加的商品归属权固定为老板账户，确保商品所有权清晰
    const BOSS_USER_ID = 'a256890e-d87a-4b90-8158-301007001c23';
    const { error } = await supabase.from('products').insert({
      seller_id: BOSS_USER_ID,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      original_price: origPrice,
      consignment_price: price,
      consignment_fee: 0,
      storage_fee: 0,
      generation: Number(form.generation) || 1,
      condition: form.condition,
      specs,
      images,
      status: 'approved',
      is_active: true,
    });
    setCreating(false);
    if (error) { toast.error('创建失败：' + error.message); return; }
    toast.success('商品已创建并直接上架');
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setImages([]);
    fetchItems();
  }

  // addImage kept as dead-code removed - image upload via file input only

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        setUploadProgress(0);
        const result = await uploadProductImage(file, pct => setUploadProgress(pct));
        setImages(prev => [...prev, result.url]);
        if (result.compressed) {
          toast.success(`图片已压缩至 ${(result.finalSize / 1024).toFixed(0)} KB 并上传`);
        } else {
          toast.success('图片上传成功');
        }
      } catch (err: unknown) {
        toast.error('上传失败：' + (err instanceof Error ? err.message : '未知错误'));
      }
    }
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="商品寄卖审核" description={`共 ${total} 条`}
        action={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus size={13} />新增商品
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-40">
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索商品名称" className="h-8 text-xs bg-muted border-border pl-3" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已上架</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
            <SelectItem value="withdrawn">已下架</SelectItem>
            <SelectItem value="sold">已售出</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['商品名称', '分类', '寄卖价', '卖方', '提交时间', '状态', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无数据</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-40 truncate">{item.title}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{(item.category as any)?.name ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">¥{Number(item.consignment_price).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">{(item.seller as any)?.phone ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(item.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(item); setDetailOpen(true); }}
                      className="h-6 px-2 text-xs border border-border">
                      <Eye size={11} className="mr-1" />详情
                    </Button>
                    {item.status === 'pending' && <>
                      <Button variant="ghost" size="sm" onClick={() => handleApprove(item)}
                        className="h-6 px-2 text-xs border border-success/40 text-success hover:bg-success/10">
                        <CheckCircle size={11} className="mr-1" />通过
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelected(item); setRejectReason(''); setRejectOpen(true); }}
                        className="h-6 px-2 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10">
                        <XCircle size={11} className="mr-1" />拒绝
                      </Button>
                    </>}
                    {item.status === 'approved' && (
                      <Button variant="ghost" size="sm" onClick={() => handleWithdraw(item)}
                        className="h-6 px-2 text-xs border border-border text-muted-foreground hover:text-foreground">
                        下架
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-7 px-3 text-xs border border-border">上一页</Button>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="h-7 px-3 text-xs border border-border">下一页</Button>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">商品详情</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground mb-1">商品名称</p><p className="text-foreground">{selected.title}</p></div>
                <div><p className="text-muted-foreground mb-1">分类</p><p className="text-foreground">{(selected.category as any)?.name ?? '-'}</p></div>
                <div><p className="text-muted-foreground mb-1">寄卖价格</p><p className="text-primary font-mono font-medium">¥{Number(selected.consignment_price).toFixed(2)}</p></div>
                <div><p className="text-muted-foreground mb-1">原价</p><p className="font-mono">¥{Number(selected.original_price).toFixed(2)}</p></div>
                <div><p className="text-muted-foreground mb-1">卖方手机</p><p className="font-mono">{(selected.seller as any)?.phone ?? '-'}</p></div>
                <div><p className="text-muted-foreground mb-1">商品代数</p><p>第 {selected.generation} 代</p></div>
                <div><p className="text-muted-foreground mb-1">商品成色</p><p>{selected.condition ?? '-'}</p></div>
              </div>
              {selected.specs && Object.keys(selected.specs).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">规格参数</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(selected.specs).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <span className="text-muted-foreground shrink-0">{k}:</span>
                        <span className="text-foreground">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.description && <div><p className="text-muted-foreground mb-1">商品描述</p><p className="text-foreground text-pretty">{selected.description}</p></div>}
              {Array.isArray(selected.images) && selected.images.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">商品图片</p>
                  <div className="flex gap-2 flex-wrap">
                    {selected.images.slice(0, 6).map((img, i) => (
                      <img key={i} src={img} alt={`图片${i+1}`} className="w-20 h-20 object-cover rounded-sm border border-border" />
                    ))}
                  </div>
                </div>
              )}
              {selected.reject_reason && (
                <div className="p-2 bg-destructive/10 border border-destructive/30 rounded-sm">
                  <p className="text-destructive">拒绝原因：{selected.reject_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 拒绝弹窗 */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">拒绝商品审核</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因（选填）" className="text-xs bg-muted border-border min-h-20 resize-none" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={confirmReject} className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 border-0">确认拒绝</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增商品弹窗 */}
      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) { setForm(EMPTY_FORM); setImages([]); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-sm">新增商品（平台直营）</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">商品名称 *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="请输入商品名称" className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">寄卖价格（元）*</Label>
                <Input type="number" min={0} value={form.consignment_price}
                  onChange={e => setForm(f => ({ ...f, consignment_price: e.target.value }))}
                  placeholder="如：1688" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">原价（元，选填）</Label>
                <Input type="number" min={0} value={form.original_price}
                  onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))}
                  placeholder="默认与寄卖价相同" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">商品分类</Label>
                <Select value={form.category_id || 'none'} onValueChange={v => setForm(f => ({ ...f, category_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue placeholder="请选择分类" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不设分类</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">商品代数</Label>
                <Input type="number" min={1} value={form.generation}
                  onChange={e => setForm(f => ({ ...f, generation: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">商品成色</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">规格参数（每行一条，格式：品牌: Apple）</Label>
              <Textarea value={form.specsText} onChange={e => setForm(f => ({ ...f, specsText: e.target.value }))}
                placeholder={"品牌: Apple\n型号: iPhone 15 Pro\n存储: 256GB\n颜色: 钛灰色"}
                className="text-xs bg-muted border-border min-h-20 resize-none font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">商品描述</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="请输入商品描述（选填）" className="text-xs bg-muted border-border min-h-16 resize-none" />
            </div>

            {/* 图片上传 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">商品图片 *（支持直接上传，超1MB自动压缩为WEBP）</Label>

              {/* 上传按钮 */}
              <div className="flex gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 text-xs border border-border gap-1.5"
                >
                  <Upload size={12} />{uploading ? '上传中...' : '选择图片上传'}
                </Button>
              </div>

              {/* 上传进度条 */}
              {uploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                </div>
              )}

              {/* 说明 */}
              <p className="text-xs text-muted-foreground">支持 JPEG / PNG / WEBP / GIF / AVIF，单张超1MB自动压缩</p>

              {/* 已上传图片预览 */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group w-16 h-16 rounded-sm overflow-hidden border border-border">
                      <img src={img} alt={`图${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 费率预览 */}
            {form.consignment_price && !isNaN(Number(form.consignment_price)) && Number(form.consignment_price) > 0 && (
              <div className="p-3 bg-muted/50 border border-border rounded-sm text-xs space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground">费率预览（自动计算）</p>
                <p className="text-foreground font-medium">卖方到手：¥{(Number(form.consignment_price) * 1.0).toFixed(2)}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} className="h-8 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || uploading} className="h-8 px-4 text-xs gap-1">
                <Plus size={12} />{creating ? '创建中...' : '创建并上架'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
