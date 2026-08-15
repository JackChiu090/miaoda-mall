// 进货抢单商品管理：管理员手动添加/上下架进货市场抢购商品
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Eye, Pencil, Trash2, ImagePlus, X, Package,
  ToggleLeft, ToggleRight, Search, Copy, MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';import { toast } from 'sonner';
import { uploadProductImage } from '@/utils/imageUpload';
import type { ProductCategory } from '@/types/types';

const PAGE_SIZE = 20;

const CONDITIONS = ['全新', '99新', '9.5新', '9新', '8.5新', '8新', '7新', '其他'];

const EMPTY_FORM = {
  title: '',
  description: '',
  category_id: '',
  original_price: '',
  consignment_price: '',
  condition: '全新',
  generation: '1',
  specsText: '',
};

interface RushProduct {
  id: string;
  title: string;
  images: string[];
  consignment_price: number;
  original_price: number;
  condition: string;
  generation: number;
  status: string;
  is_active: boolean;
  created_at: string;
  category?: { name: string } | null;
  seller?: { nickname: string; phone: string } | null;
}

/** 正价寄卖商品（用于复制选择器） */
interface ConsignProduct {
  id: string;
  title: string;
  images: string[];
  consignment_price: number;
  original_price: number;
  condition: string;
  generation: number;
  description: string | null;
  category_id: string | null;
  specs: Record<string, string> | null;
  category?: { name: string } | null;
}

export default function RushProductsPage() {
  const [items, setItems] = useState<RushProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  // 新增 / 编辑表单
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 详情预览
  const [previewItem, setPreviewItem] = useState<RushProduct | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<RushProduct | null>(null);

  // 从正价商品复制
  const [copyOpen, setCopyOpen] = useState(false);
  const [consignList, setConsignList] = useState<ConsignProduct[]>([]);
  const [consignSearch, setConsignSearch] = useState('');
  const [consignLoading, setConsignLoading] = useState(false);

  // ── 加载分类 ──
  useEffect(() => {
    supabase.from('product_categories').select('id,name').order('name').then(({ data }) => {
      setCategories((data ?? []) as ProductCategory[]);
    });
  }, []);

  // ── 加载正价寄卖商品（用于复制） ──
  const loadConsignList = useCallback(async (keyword = '') => {
    setConsignLoading(true);
    let q = supabase
      .from('products')
      .select('id,title,images,consignment_price,original_price,condition,generation,description,category_id,specs,category:category_id(name)')
      .eq('status', 'approved')
      .not('seller_id', 'is', null);   // 有 seller_id 的才是寄卖商品
    if (keyword.trim()) q = q.ilike('title', `%${keyword.trim()}%`);
    const { data } = await q.order('created_at', { ascending: false }).limit(50);
    setConsignList((data ?? []) as unknown as ConsignProduct[]);
    setConsignLoading(false);
  }, []);

  // 打开复制弹窗时加载列表
  function openCopy() {
    setCopyOpen(true);
    setConsignSearch('');
    loadConsignList('');
  }

  // 选中一件寄卖商品 → 预填表单并打开新增弹窗
  function handlePickConsign(p: ConsignProduct) {
    const specsText = p.specs
      ? Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '';
    setEditingId(null);
    setForm({
      title: p.title,
      description: p.description ?? '',
      category_id: p.category_id ?? '',
      original_price: String(p.original_price),
      consignment_price: String(p.consignment_price),
      condition: p.condition,
      generation: String(p.generation),
      specsText,
    });
    setImages(p.images ?? []);
    setCopyOpen(false);
    setFormOpen(true);
    toast.info('已预填商品信息，确认后点击「立即添加上架」');
  }

  // ── 加载商品列表 ──
  const fetchItems = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    // 只展示平台自营（seller_id=null 或 is_resell=false）的已通过商品
    let q = supabase
      .from('products')
      .select('id,title,images,consignment_price,original_price,condition,generation,status,is_active,created_at,category:category_id(name),seller:seller_id(nickname,phone)', { count: 'exact' })
      .eq('status', 'approved')
      .eq('is_resell', false);

    if (activeFilter === 'active')   q = q.eq('is_active', true);
    if (activeFilter === 'inactive') q = q.eq('is_active', false);
    if (search) q = q.ilike('title', `%${search}%`);

    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (error) { toast.error('加载失败'); }
    setItems((data ?? []) as unknown as RushProduct[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, activeFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── 打开新增/编辑弹窗 ──
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImages([]);
    setFormOpen(true);
  }

  function openEdit(item: RushProduct) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: '',
      category_id: '',
      original_price: String(item.original_price),
      consignment_price: String(item.consignment_price),
      condition: item.condition,
      generation: String(item.generation),
      specsText: '',
    });
    setImages(item.images ?? []);
    setFormOpen(true);
  }

  // ── 图片上传 ──
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        setUploadProgress(0);
        const result = await uploadProductImage(file, pct => setUploadProgress(pct));
        setImages(prev => [...prev, result.url]);
        toast.success(result.compressed
          ? `图片已压缩（${(result.finalSize / 1024).toFixed(0)}KB）并上传`
          : '图片上传成功');
      } catch (err: unknown) {
        toast.error('上传失败：' + (err instanceof Error ? err.message : '未知错误'));
      }
    }
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── 保存（新增/编辑）──
  async function handleSave() {
    if (!form.title.trim())                                  { toast.error('请输入商品名称'); return; }
    if (!form.consignment_price || isNaN(Number(form.consignment_price))) { toast.error('请输入有效抢购价'); return; }
    if (images.length === 0)                                 { toast.error('请至少上传一张图片'); return; }

    setSaving(true);
    const price    = Number(form.consignment_price);
    const origPrice = form.original_price ? Number(form.original_price) : price;
    const fee      = Number((price * 0.015).toFixed(2));

    const specs: Record<string, string> = {};
    form.specsText.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) specs[k] = v;
      }
    });

    const payload = {
      title:             form.title.trim(),
      description:       form.description.trim() || null,
      category_id:       form.category_id || null,
      original_price:    origPrice,
      consignment_price: price,
      consignment_fee:   0,
      storage_fee:       0,
      generation:        Number(form.generation) || 1,
      condition:         form.condition,
      images,
      specs: Object.keys(specs).length ? specs : {},
      status:    'approved',
      is_active: true,
      is_resell: false,
      // 后台管理员新增的抢单商品，归属刘鑫（13924151349）寄卖
      seller_id: 'a256890e-d87a-4b90-8158-301007001c23',
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('products').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('products').insert(payload));
    }

    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(editingId ? '商品信息已更新' : '商品已添加并直接上架');
    setFormOpen(false);
    fetchItems();
  }

  // ── 上下架切换 ──
  async function toggleActive(item: RushProduct) {
    const next = !item.is_active;
    const { error } = await supabase.from('products').update({ is_active: next }).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success(next ? `「${item.title}」已上架` : `「${item.title}」已下架`);
    fetchItems();
  }

  // ── 删除：有关联订单则改为下架 ──
  async function handleDelete(item: RushProduct) {
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('product_id', item.id);
    if ((count ?? 0) > 0) {
      await supabase.from('products').update({ status: 'withdrawn' }).eq('id', item.id);
      toast.warning('该商品存在关联订单，已自动改为下架处理');
    } else {
      const { error } = await supabase.from('products').delete().eq('id', item.id);
      if (error) { toast.error('删除失败：' + error.message); return; }
      toast.success('商品已删除');
    }
    setDeleteTarget(null);
    fetchItems();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <PageHeader
          title="进货抢单商品管理"
          description={`管理进货市场中可供用户抢购的商品，当前共 ${total} 件`}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={openCopy} className="gap-2">
                <Copy size={16} />从正价商品复制
              </Button>
              <Button onClick={openCreate} className="gap-2">
                <Plus size={16} />手动添加商品
              </Button>
            </div>
          }
        />

        {/* 筛选栏 */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索商品名称…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <Button
                key={f}
                size="sm"
                variant={activeFilter === f ? 'default' : 'outline'}
                className="h-9 text-xs"
                onClick={() => { setActiveFilter(f); setPage(1); }}
              >
                {f === 'all' ? '全部' : f === 'active' ? '已上架' : '已下架'}
              </Button>
            ))}
          </div>
        </div>

        {/* 商品表格 */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">图片</TableHead>
                <TableHead>商品名称</TableHead>
                <TableHead className="whitespace-nowrap">归属商家</TableHead>
                <TableHead className="whitespace-nowrap">分类 / 成色</TableHead>
                <TableHead className="whitespace-nowrap">价格</TableHead>
                <TableHead className="whitespace-nowrap">状态</TableHead>
                <TableHead className="whitespace-nowrap">添加时间</TableHead>
                <TableHead className="whitespace-nowrap text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
                : items.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Package size={32} className="mx-auto mb-2 opacity-30" />
                        暂无商品，点击右上角「手动添加商品」
                      </TableCell>
                    </TableRow>
                  )
                  : items.map(item => (
                    <TableRow key={item.id} className="group">
                      <TableCell>
                        <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0">
                          {item.images?.[0]
                            ? <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                            : <Package size={16} className="m-auto mt-2.5 text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">第{item.generation}代</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.seller ? (
                          <div>
                            <p className="font-medium">{item.seller.nickname}</p>
                            <p className="text-xs text-muted-foreground">{item.seller.phone}</p>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <p>{item.category?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{item.condition}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <p className="font-semibold text-primary">¥{item.consignment_price?.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground line-through">¥{item.original_price?.toLocaleString()}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={item.is_active ? 'default' : 'secondary'}>
                          {item.is_active ? '已上架' : '已下架'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right w-24">
                        <div className="flex items-center justify-end gap-1">
                          {/* 上下架开关保留行内 */}
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title={item.is_active ? '点击下架' : '点击上架'}
                            onClick={() => toggleActive(item)}
                          >
                            {item.is_active
                              ? <ToggleRight size={16} className="text-primary" />
                              : <ToggleLeft size={16} className="text-muted-foreground" />}
                          </Button>
                          {/* 其他操作折叠到下拉菜单 */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <MoreHorizontal size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onClick={() => {
                                setEditingId(null);
                                setForm({
                                  title: item.title,
                                  description: '',
                                  category_id: '',
                                  original_price: String(item.original_price),
                                  consignment_price: String(item.consignment_price),
                                  condition: item.condition,
                                  generation: String(item.generation),
                                  specsText: '',
                                });
                                setImages(item.images ?? []);
                                setFormOpen(true);
                                toast.info('已复制商品信息，修改后点击「立即添加上架」保存');
                              }}>
                                <Copy size={14} className="mr-2" />复制为新商品
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPreviewItem(item)}>
                                <Eye size={14} className="mr-2" />查看详情
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(item)}>
                                <Pencil size={14} className="mr-2" />编辑商品
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(item)}
                              >
                                <Trash2 size={14} className="mr-2" />删除商品
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {total} 件，第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── 新增/编辑 弹窗 ── */}
      <Dialog open={formOpen} onOpenChange={open => { if (!open) setFormOpen(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑抢单商品' : '手动添加抢单商品'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* 商品名称 */}
            <div className="space-y-1.5">
              <Label>商品名称 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="如：Apple iPhone 15 Pro 256GB 深空黑"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* 分类 & 成色 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="请选择分类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>成色</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 市场价 & 抢购价 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>市场参考价（元）</Label>
                <Input
                  type="number" min="0" placeholder="0.00"
                  value={form.original_price}
                  onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>抢购价（元）<span className="text-destructive">*</span></Label>
                <Input
                  type="number" min="0" placeholder="0.00"
                  value={form.consignment_price}
                  onChange={e => setForm(f => ({ ...f, consignment_price: e.target.value }))}
                />
                {form.consignment_price && !isNaN(Number(form.consignment_price)) && (
                  <p className="text-xs text-muted-foreground">
                    抢购价：¥{Number(form.consignment_price).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* 代数 */}
            <div className="space-y-1.5">
              <Label>代数</Label>
              <Input
                type="number" min="1" placeholder="1"
                value={form.generation}
                onChange={e => setForm(f => ({ ...f, generation: e.target.value }))}
                className="w-32"
              />
            </div>

            {/* 规格参数 */}
            <div className="space-y-1.5">
              <Label>规格参数（选填，格式：键: 值，每行一条）</Label>
              <Textarea
                placeholder={'品牌: Apple\n型号: iPhone 15 Pro\n存储: 256GB'}
                rows={3}
                value={form.specsText}
                onChange={e => setForm(f => ({ ...f, specsText: e.target.value }))}
                className="text-sm font-mono"
              />
            </div>

            {/* 商品描述 */}
            <div className="space-y-1.5">
              <Label>商品描述（选填）</Label>
              <Textarea
                placeholder="补充说明商品状况、配件、保修等…"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm"
              />
            </div>

            {/* 图片上传 */}
            <div className="space-y-2">
              <Label>商品图片 <span className="text-destructive">*</span></Label>
              <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              <div className="flex flex-wrap gap-2">
                {images.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded overflow-hidden border border-border bg-muted group">
                    <img src={url} alt="商品图" className="w-full h-full object-cover" />
                    <button
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X size={16} className="text-white" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-16 h-16 rounded border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px] mt-0.5">{uploading ? '上传中' : '添加图片'}</span>
                </button>
              </div>
              {uploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">上传中 {uploadProgress}%…</p>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={saving || uploading} className="gap-2">
                {saving ? '保存中…' : editingId ? '保存修改' : '立即添加上架'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 商品预览弹窗 ── */}
      <Dialog open={!!previewItem} onOpenChange={open => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>商品详情</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-3">
              {previewItem.images?.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {previewItem.images.map((url, i) => (
                    <img key={i} src={url} alt="图片" className="w-24 h-24 object-cover rounded shrink-0 border border-border" />
                  ))}
                </div>
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">商品名称</span><span className="font-medium text-right max-w-[60%]">{previewItem.title}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">归属商家</span>
                  <span className="text-right">
                    {previewItem.seller
                      ? <><span className="font-medium">{previewItem.seller.nickname}</span><span className="text-muted-foreground ml-1">({previewItem.seller.phone})</span></>
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">分类</span><span>{previewItem.category?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">成色</span><span>{previewItem.condition}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">代数</span><span>第 {previewItem.generation} 代</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">市场价</span><span>¥{previewItem.original_price?.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">抢购价</span><span className="font-bold text-primary text-base">¥{previewItem.consignment_price?.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">状态</span>
                  <Badge variant={previewItem.is_active ? 'default' : 'secondary'}>{previewItem.is_active ? '已上架' : '已下架'}</Badge>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 删除确认 ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除商品？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{deleteTarget?.title}」，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 从正价商品复制 弹窗 ── */}
      <Dialog open={copyOpen} onOpenChange={open => { if (!open) setCopyOpen(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>从正价寄卖商品复制</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            选择一件已上架的寄卖商品，信息将自动预填到新增表单中，可修改后上架为抢单商品。
          </p>

          {/* 搜索框 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索商品名称…"
              value={consignSearch}
              onChange={e => setConsignSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadConsignList(consignSearch); }}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* 商品列表 */}
          <div className="space-y-2 mt-1">
            {consignLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                  <Skeleton className="w-14 h-14 rounded shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
              : consignList.length === 0
                ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Package size={28} className="mx-auto mb-2 opacity-30" />
                    未找到匹配的寄卖商品
                  </div>
                )
                : consignList.map(p => (
                  <button
                    key={p.id}
                    className="w-full flex gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors text-left group"
                    onClick={() => handlePickConsign(p)}
                  >
                    <div className="w-14 h-14 rounded overflow-hidden bg-muted shrink-0">
                      {p.images?.[0]
                        ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                        : <Package size={16} className="m-auto mt-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.category?.name ?? '未分类'} · {p.condition} · 第{p.generation}代
                      </p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">市场价 ¥{p.original_price?.toLocaleString()}</span>
                        <span className="text-xs font-semibold text-primary">寄卖价 ¥{p.consignment_price?.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="shrink-0 self-center">
                      <Copy size={14} className="text-muted-foreground group-hover:text-primary" />
                    </div>
                  </button>
                ))}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
