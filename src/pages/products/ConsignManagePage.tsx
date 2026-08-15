// 寄卖商品管理页（后台全量管理）
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Search, Filter, Download, Pencil, Trash2, Eye, X,
  CheckCircle, XCircle, ArrowDownCircle, RefreshCw,
  ImageIcon, Package, ChevronUp, ChevronDown, Loader2,
  AlertTriangle, Upload, Copy,
} from 'lucide-react';
import { uploadProductImage } from '@/utils/imageUpload';
import type { Product, ProductCategory } from '@/types/types';

// ─── 常量 ─────────────────────────────────────────
const PAGE_SIZE = 20;

const CONDITIONS = ['全新', '99新', '9.5新', '9新', '8.5新', '8新', '7新', '其他'];

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已上架' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'withdrawn', label: '已下架' },
  { value: 'sold', label: '已售出' },
];

const STATUS_ACTIONS: Record<string, { label: string; next: Product['status']; color: string }[]> = {
  pending:   [{ label: '通过上架', next: 'approved', color: 'text-green-600 border-green-300 hover:bg-green-50' }, { label: '拒绝', next: 'rejected', color: 'text-destructive border-destructive/30 hover:bg-destructive/5' }],
  approved:  [{ label: '下架', next: 'withdrawn', color: 'text-muted-foreground border-border hover:bg-muted/50' }],
  rejected:  [{ label: '重新上架', next: 'approved', color: 'text-green-600 border-green-300 hover:bg-green-50' }],
  withdrawn: [{ label: '重新上架', next: 'approved', color: 'text-green-600 border-green-300 hover:bg-green-50' }],
  sold:      [],
};

// 编辑表单初始值
function toEditForm(p: Product) {
  return {
    title:              p.title,
    description:        p.description ?? '',
    category_id:        p.category_id ?? '',
    original_price:     String(p.original_price),
    consignment_price:  String(p.consignment_price),
    generation:         String(p.generation),
    condition:          p.condition,
    is_active:          p.is_active,
    specsText:          Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

type EditForm = ReturnType<typeof toEditForm>;

// ─── 图片大图预览 ──────────────────────────────────
function ImageGallery({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  if (!images.length) return <div className="flex items-center justify-center h-40 bg-muted rounded-lg text-muted-foreground text-xs gap-2"><ImageIcon size={20} />暂无图片</div>;
  return (
    <div className="space-y-2">
      <div className="relative aspect-square max-h-56 overflow-hidden rounded-lg bg-muted">
        <img src={images[current]} alt="商品图" className="w-full h-full object-contain" />
        {images.length > 1 && (
          <>
            <button onClick={() => setCurrent(i => (i - 1 + images.length) % images.length)}
              className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors">
              <ChevronUp size={14} className="rotate-[-90deg]" />
            </button>
            <button onClick={() => setCurrent(i => (i + 1) % images.length)}
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors">
              <ChevronDown size={14} className="rotate-[-90deg]" />
            </button>
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-2 py-0.5 text-[10px] text-white">{current + 1} / {images.length}</div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {images.map((img, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`w-12 h-12 rounded border-2 overflow-hidden shrink-0 transition-colors ${i === current ? 'border-primary' : 'border-border'}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 已售订单信息
interface SoldOrderInfo {
  order_no: string;
  created_at: string;
  completed_at: string | null;
  buyer_name: string;
  buyer_phone: string;
}

// ─── 主组件 ────────────────────────────────────────
export default function ConsignManagePage() {
  const [items,    setItems]    = useState<Product[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  // 已售商品的关联订单信息 map: product_id → SoldOrderInfo
  const [soldOrderMap, setSoldOrderMap] = useState<Record<string, SoldOrderInfo>>({});

  // 筛选
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search,         setSearch]         = useState('');

  // 多选批量
  const [checkedIds,     setCheckedIds]     = useState<Set<string>>(new Set());
  const [batchDialog,    setBatchDialog]    = useState<'withdraw' | 'delete' | null>(null);
  const [batchLoading,   setBatchLoading]   = useState(false);

  // 弹窗
  const [detailItem,   setDetailItem]   = useState<Product | null>(null);
  const [editItem,     setEditItem]     = useState<Product | null>(null);
  const [editForm,     setEditForm]     = useState<EditForm | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Product | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // 图片上传（编辑弹窗内）
  const [editImages,       setEditImages]       = useState<string[]>([]);
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [uploading,        setUploading]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 加载数据 ──
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setCheckedIds(new Set());
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase
      .from('products')
      .select('*, seller:seller_id(phone,nickname,real_name), category:category_id(name)', { count: 'exact' });
    if (statusFilter !== 'all')   q = q.eq('status', statusFilter);
    if (categoryFilter !== 'all') q = q.eq('category_id', categoryFilter);
    if (search.trim())            q = q.ilike('title', `%${search.trim()}%`);
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    const productList = Array.isArray(data) ? data : [];
    setItems(productList);
    setTotal(count ?? 0);

    // 批量查已售商品的关联订单（含买家信息）
    const soldIds = productList.filter(p => p.status === 'sold').map(p => p.id);
    if (soldIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('product_id, order_no, created_at, completed_at, buyer_id')
        .in('product_id', soldIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      const orderRows = ordersData ?? [];
      const buyerIds = [...new Set(orderRows.map((o: any) => o.buyer_id).filter(Boolean))];
      const { data: buyerData } = buyerIds.length > 0
        ? await supabase.from('users').select('id, real_name, phone').in('id', buyerIds)
        : { data: [] };
      const buyerMap: Record<string, { real_name: string; phone: string }> = {};
      (buyerData ?? []).forEach((u: any) => { buyerMap[u.id] = u; });

      const newMap: Record<string, SoldOrderInfo> = {};
      orderRows.forEach((o: any) => {
        if (!newMap[o.product_id]) { // 只取最新一条
          newMap[o.product_id] = {
            order_no: o.order_no,
            created_at: o.created_at,
            completed_at: o.completed_at ?? null,
            buyer_name: buyerMap[o.buyer_id]?.real_name ?? '-',
            buyer_phone: buyerMap[o.buyer_id]?.phone ?? '-',
          };
        }
      });
      setSoldOrderMap(newMap);
    } else {
      setSoldOrderMap({});
    }
  }, [page, statusFilter, categoryFilter, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    supabase.from('product_categories').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  // ── 状态变更（单条） ──
  async function changeStatus(item: Product, next: Product['status'], reason?: string) {
    if (next === 'rejected' && !reason) {
      setRejectTarget(item);
      setRejectReason('');
      return;
    }
    const payload: Record<string, unknown> = { status: next, reviewed_at: new Date().toISOString() };
    if (reason) payload.reject_reason = reason;
    const { error } = await supabase.from('products').update(payload).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    const labels: Record<string, string> = { approved: '已上架', rejected: '已拒绝', withdrawn: '已下架' };
    toast.success(`商品已${labels[next] ?? '更新'}`);
    fetchItems();
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    await changeStatus(rejectTarget, 'rejected', rejectReason || '不符合上架要求');
    setRejectTarget(null);
  }

  // ── 删除（单条）：有关联订单则改为下架，无关联才真正删除 ──
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('product_id', deleteTarget.id);
    if ((count ?? 0) > 0) {
      // 有订单关联，改为下架
      await supabase.from('products').update({ status: 'withdrawn' }).eq('id', deleteTarget.id);
      toast.warning('该商品存在关联订单，已自动改为下架处理');
    } else {
      const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
      if (error) { toast.error('删除失败'); return; }
      toast.success('商品已删除');
    }
    setDeleteTarget(null);
    fetchItems();
  }

  // ── 编辑保存 ──
  function openEdit(item: Product) {
    setEditItem(item);
    setEditForm(toEditForm(item));
    setEditImages([...(item.images ?? [])]);
  }

  async function handleSave() {
    if (!editItem || !editForm) return;
    if (!editForm.title.trim()) { toast.error('请输入商品名称'); return; }
    if (!editForm.consignment_price || isNaN(Number(editForm.consignment_price))) { toast.error('请输入有效寄卖价格'); return; }
    setSaving(true);
    const price = Number(editForm.consignment_price);
    const origPrice = editForm.original_price ? Number(editForm.original_price) : price;
    const specs: Record<string, string> = {};
    editForm.specsText.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const k = line.slice(0, idx).trim(), v = line.slice(idx + 1).trim();
        if (k && v) specs[k] = v;
      }
    });
    const payload = {
      title:             editForm.title.trim(),
      description:       editForm.description.trim() || null,
      category_id:       editForm.category_id || null,
      original_price:    origPrice,
      consignment_price: price,
      consignment_fee:   0,
      storage_fee:       0,
      generation:        Number(editForm.generation) || 1,
      condition:         editForm.condition,
      is_active:         editForm.is_active,
      specs,
      images:            editImages,
      updated_at:        new Date().toISOString(),
    };
    const { error } = editItem.id
      ? await supabase.from('products').update(payload).eq('id', editItem.id)
      : await supabase.from('products').insert({ ...payload, seller_id: editItem.seller_id, status: 'approved', is_active: true, created_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success(editItem.id ? '商品信息已更新' : '已复制为新商品并自动上架');
    setEditItem(null);
    setEditForm(null);
    fetchItems();
  }

  // ── 图片上传（编辑弹窗） ──
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        setUploadProgress(0);
        const result = await uploadProductImage(file, pct => setUploadProgress(pct));
        setEditImages(prev => [...prev, result.url]);
        if (result.compressed) toast.success(`图片已压缩至 ${(result.finalSize / 1024).toFixed(0)} KB`);
        else toast.success('图片上传成功');
      } catch (err: unknown) {
        toast.error('上传失败：' + (err instanceof Error ? err.message : '未知错误'));
      }
    }
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── 批量操作 ──
  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const allChecked = items.length > 0 && items.every(i => checkedIds.has(i.id));
  function toggleAll() {
    setCheckedIds(allChecked ? new Set() : new Set(items.map(i => i.id)));
  }

  async function executeBatch(action: 'withdraw' | 'delete') {
    if (!checkedIds.size) return;
    setBatchLoading(true);
    const ids = Array.from(checkedIds);
    if (action === 'withdraw') {
      await supabase.from('products').update({ status: 'withdrawn' }).in('id', ids);
      toast.success(`已下架 ${ids.length} 件商品`);
    } else {
      // 查询哪些商品有关联订单（不可物理删除）
      const { data: linked } = await supabase.from('orders').select('product_id').in('product_id', ids);
      const linkedIds = new Set((linked ?? []).map(r => r.product_id).filter(Boolean));
      const deletableIds = ids.filter(id => !linkedIds.has(id));
      const withdrawIds  = ids.filter(id =>  linkedIds.has(id));
      if (deletableIds.length) {
        await supabase.from('products').delete().in('id', deletableIds);
      }
      if (withdrawIds.length) {
        await supabase.from('products').update({ status: 'withdrawn' }).in('id', withdrawIds);
      }
      if (deletableIds.length && withdrawIds.length) {
        toast.success(`已删除 ${deletableIds.length} 件，${withdrawIds.length} 件因有关联订单已改为下架`);
      } else if (deletableIds.length) {
        toast.success(`已删除 ${deletableIds.length} 件商品`);
      } else {
        toast.warning(`${withdrawIds.length} 件商品均有关联订单，已改为下架处理`);
      }
    }
    setBatchLoading(false);
    setBatchDialog(null);
    setCheckedIds(new Set());
    fetchItems();
  }

  // ── 导出 Excel ──
  async function handleExport() {
    toast.info('正在导出，请稍候...');
    let q = supabase.from('products').select('*, seller:seller_id(phone,nickname), category:category_id(name)');
    if (statusFilter !== 'all')   q = q.eq('status', statusFilter);
    if (categoryFilter !== 'all') q = q.eq('category_id', categoryFilter);
    if (search.trim())            q = q.ilike('title', `%${search.trim()}%`);
    const { data } = await q.order('created_at', { ascending: false });
    if (!data?.length) { toast.error('无数据可导出'); return; }
    const rows = data.map(p => ({
      '商品ID': p.id,
      '商品名称': p.title,
      '分类': (p.category as any)?.name ?? '-',
      '寄卖价': p.consignment_price,
      '原价': p.original_price,
      '成色': p.condition,
      '代数': p.generation,
      '状态': p.status,
      '是否上架': p.is_active ? '是' : '否',
      '卖方手机': (p.seller as any)?.phone ?? '-',
      '卖方昵称': (p.seller as any)?.nickname ?? '-',
      '提交时间': new Date(p.created_at).toLocaleDateString('zh-CN'),
      '拒绝原因': p.reject_reason ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '寄卖商品');
    XLSX.writeFile(wb, `寄卖商品_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`);
    toast.success('导出成功');
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader
        title="寄卖商品管理"
        description={`共 ${total} 件商品`}
        action={
          <Button size="sm" variant="ghost" onClick={handleExport}
            className="h-8 gap-1.5 text-xs border border-border">
            <Download size={13} />导出 Excel
          </Button>
        }
      />

      {/* ── 筛选栏 ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-44">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索商品名称…" className="h-8 text-xs bg-muted border-border pl-7" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border">
            <Filter size={11} className="mr-1.5 text-muted-foreground shrink-0" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs bg-muted border-border"><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={fetchItems}
          className="h-8 w-8 p-0 border border-border" title="刷新">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* ── 批量操作栏 ── */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-sm text-xs">
          <span className="text-primary font-medium">已选 {checkedIds.size} 件</span>
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="ghost"
              className="h-7 px-2.5 text-xs border border-border text-muted-foreground"
              onClick={() => setBatchDialog('withdraw')}>
              批量下架
            </Button>
            <Button size="sm" variant="ghost"
              className="h-7 px-2.5 text-xs border border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setBatchDialog('delete')}>
              <Trash2 size={11} className="mr-1" />批量删除
            </Button>
            <Button size="sm" variant="ghost"
              className="h-7 px-2 border border-border text-muted-foreground"
              onClick={() => setCheckedIds(new Set())}>
              <X size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* ── 商品表格 ── */}
      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2.5 w-8">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="w-3.5 h-3.5" />
              </th>
              {['商品', '分类', '寄卖价', '成色/代数', '卖方姓名', '卖方电话', '买方姓名', '买方电话', '订单编号', '下单时间', '完成时间', '提交时间', '状态', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />加载中...
                </div>
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={14} className="py-16 text-center text-xs text-muted-foreground">
                <Package size={28} className="mx-auto mb-2 opacity-30" />
                暂无商品数据
              </td></tr>
            ) : items.map((item, i) => {
              const img = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null;
              const actions = STATUS_ACTIONS[item.status] ?? [];
              const soldOrder = soldOrderMap[item.id];
              return (
                <tr key={item.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${checkedIds.has(item.id) ? 'bg-primary/3' : i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5">
                    <Checkbox checked={checkedIds.has(item.id)} onCheckedChange={() => toggleCheck(item.id)} className="w-3.5 h-3.5" />
                  </td>
                  {/* 商品缩略 */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 max-w-44">
                      <div className="w-9 h-9 rounded-sm bg-muted shrink-0 overflow-hidden border border-border">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="m-auto mt-1.5 text-muted-foreground/40" />}
                      </div>
                      <p className="text-xs text-foreground line-clamp-2 leading-tight">{item.title}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {(item.category as any)?.name ?? <span className="text-muted-foreground/40">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-medium text-primary">
                    ¥{Number(item.consignment_price).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    <span className="text-foreground">{item.condition}</span>
                    <span className="text-muted-foreground ml-1">/ 第{item.generation}代</span>
                  </td>
                  {/* 卖方姓名 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {(item.seller as any)?.real_name ?? (item.seller as any)?.nickname ?? '-'}
                  </td>
                  {/* 卖方电话 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                    {(item.seller as any)?.phone ?? '-'}
                  </td>
                  {/* 买方姓名（已售出才有） */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {soldOrder ? soldOrder.buyer_name : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  {/* 买方电话 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                    {soldOrder ? soldOrder.buyer_phone : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  {/* 订单编号 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                    {soldOrder ? soldOrder.order_no : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  {/* 下单时间 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {soldOrder ? new Date(soldOrder.created_at).toLocaleDateString('zh-CN') : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  {/* 完成时间 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {soldOrder?.completed_at ? new Date(soldOrder.completed_at).toLocaleDateString('zh-CN') : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  {/* 提交时间 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <StatusBadge status={item.status} />
                      {!item.is_active && <Badge variant="secondary" className="text-[9px] px-1 py-0">禁用</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {/* 查看详情 */}
                      <Button variant="ghost" size="sm"
                        onClick={() => setDetailItem(item)}
                        className="h-6 w-6 p-0 border border-border" title="查看详情">
                        <Eye size={11} />
                      </Button>
                      {/* 编辑 */}
                      <Button variant="ghost" size="sm"
                        onClick={() => openEdit(item)}
                        className="h-6 w-6 p-0 border border-border" title="编辑">
                        <Pencil size={11} />
                      </Button>
                      {/* 状态快捷操作 */}
                      {actions.map(act => (
                        <Button key={act.next} variant="ghost" size="sm"
                          onClick={() => changeStatus(item, act.next)}
                          className={`h-6 px-2 text-xs border ${act.color}`}>
                          {act.next === 'approved' && <CheckCircle size={10} className="mr-0.5" />}
                          {act.next === 'rejected' && <XCircle size={10} className="mr-0.5" />}
                          {act.next === 'withdrawn' && <ArrowDownCircle size={10} className="mr-0.5" />}
                          {act.label}
                        </Button>
                      ))}
                      {/* 删除 */}
                      <Button variant="ghost" size="sm"
                        onClick={() => setDeleteTarget(item)}
                        className="h-6 w-6 p-0 border border-destructive/30 text-destructive hover:bg-destructive/5" title="删除">
                        <Trash2 size={11} />
                      </Button>
                      {/* 复制 */}
                      <Button variant="ghost" size="sm"
                        onClick={() => { openEdit({ ...item, id: '' } as Product); toast.info('已复制商品信息，修改后保存'); }}
                        className="h-6 w-6 p-0 border border-border" title="复制为新商品">
                        <Copy size={11} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 分页 ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>共 {total} 件，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              const p = i + 1;
              return (
                <Button key={p} variant={p === page ? 'default' : 'ghost'} size="sm"
                  onClick={() => setPage(p)}
                  className={`h-7 w-7 p-0 text-xs ${p === page ? '' : 'border border-border'}`}>
                  {p}
                </Button>
              );
            })}
            {totalPages > 7 && page < totalPages && (
              <Button variant="ghost" size="sm" onClick={() => setPage(totalPages)}
                className="h-7 px-2 text-xs border border-border">末页</Button>
            )}
          </div>
        </div>
      )}

      {/* ══ 弹窗：查看详情 ══ */}
      <Dialog open={!!detailItem} onOpenChange={o => { if (!o) setDetailItem(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Package size={14} className="text-primary" />商品详情
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <Tabs defaultValue="basic" className="mt-1">
              <TabsList className="h-8 text-xs">
                <TabsTrigger value="basic" className="text-xs h-6 px-3">基本信息</TabsTrigger>
                <TabsTrigger value="images" className="text-xs h-6 px-3">商品图片 ({detailItem.images?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="specs" className="text-xs h-6 px-3">规格参数</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-3 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['商品名称', detailItem.title],
                    ['分类', (detailItem.category as any)?.name ?? '-'],
                    ['寄卖价格', `¥${Number(detailItem.consignment_price).toFixed(2)}`],
                    ['原价', `¥${Number(detailItem.original_price).toFixed(2)}`],
                    ['商品成色', detailItem.condition],
                    ['商品代数', `第 ${detailItem.generation} 代`],
                    ['卖方手机', (detailItem.seller as any)?.phone ?? '-'],
                    ['卖方昵称', (detailItem.seller as any)?.nickname ?? '-'],
                    ['是否上架', detailItem.is_active ? '是' : '否'],
                    ['提交时间', new Date(detailItem.created_at).toLocaleString('zh-CN')],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-muted-foreground mb-0.5">{k}</p>
                      <p className="text-foreground font-medium">{v}</p>
                    </div>
                  ))}
                </div>
                {detailItem.description && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-muted-foreground mb-1">商品描述</p>
                    <p className="text-foreground text-pretty leading-relaxed">{detailItem.description}</p>
                  </div>
                )}
                {detailItem.reject_reason && (
                  <div className="p-2.5 bg-destructive/10 border border-destructive/30 rounded-sm flex gap-2">
                    <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
                    <p className="text-destructive text-xs">拒绝原因：{detailItem.reject_reason}</p>
                  </div>
                )}
                {/* 状态操作 */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {(STATUS_ACTIONS[detailItem.status] ?? []).map(act => (
                    <Button key={act.next} size="sm"
                      onClick={() => { changeStatus(detailItem, act.next); setDetailItem(null); }}
                      className={`h-7 px-3 text-xs border ${act.color}`} variant="ghost">
                      {act.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => { openEdit(detailItem); setDetailItem(null); }}
                    className="h-7 px-3 text-xs border border-border gap-1">
                    <Pencil size={11} />编辑商品
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="images" className="mt-3">
                <ImageGallery images={detailItem.images ?? []} />
              </TabsContent>

              <TabsContent value="specs" className="mt-3">
                {detailItem.specs && Object.keys(detailItem.specs).length > 0 ? (
                  <div className="divide-y divide-border border border-border rounded-sm overflow-hidden">
                    {Object.entries(detailItem.specs).map(([k, v]) => (
                      <div key={k} className="flex px-3 py-2 text-xs gap-4">
                        <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                        <span className="text-foreground flex-1">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-8 text-center">暂无规格参数</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ 弹窗：编辑商品 ══ */}
      <Dialog open={!!editItem} onOpenChange={o => { if (!o && !saving) { setEditItem(null); setEditForm(null); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Pencil size={13} className="text-primary" />编辑商品信息
            </DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">商品名称 *</Label>
                  <Input value={editForm.title} onChange={e => setEditForm(f => f ? { ...f, title: e.target.value } : f)}
                    className="h-8 text-xs bg-muted border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">寄卖价格（元）*</Label>
                  <Input type="number" min={0} value={editForm.consignment_price}
                    onChange={e => setEditForm(f => f ? { ...f, consignment_price: e.target.value } : f)}
                    className="h-8 text-xs bg-muted border-border font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">原价（元）</Label>
                  <Input type="number" min={0} value={editForm.original_price}
                    onChange={e => setEditForm(f => f ? { ...f, original_price: e.target.value } : f)}
                    className="h-8 text-xs bg-muted border-border font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">商品分类</Label>
                  <Select value={editForm.category_id || 'none'} onValueChange={v => setEditForm(f => f ? { ...f, category_id: v === 'none' ? '' : v } : f)}>
                    <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue placeholder="不设分类" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不设分类</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">商品成色</Label>
                  <Select value={editForm.condition} onValueChange={v => setEditForm(f => f ? { ...f, condition: v } : f)}>
                    <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">商品代数</Label>
                  <Input type="number" min={1} value={editForm.generation}
                    onChange={e => setEditForm(f => f ? { ...f, generation: e.target.value } : f)}
                    className="h-8 text-xs bg-muted border-border font-mono w-24" />
                </div>
              </div>

              {/* 规格 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">规格参数（每行：键: 值）</Label>
                <Textarea value={editForm.specsText} onChange={e => setEditForm(f => f ? { ...f, specsText: e.target.value } : f)}
                  className="text-xs bg-muted border-border min-h-16 resize-none font-mono"
                  placeholder={'品牌: Apple\n型号: iPhone 15 Pro'} />
              </div>

              {/* 描述 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">商品描述</Label>
                <Textarea value={editForm.description} onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                  className="text-xs bg-muted border-border min-h-16 resize-none" placeholder="商品描述（选填）" />
              </div>

              {/* 图片管理 */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">商品图片</Label>
                <div className="flex flex-wrap gap-2">
                  {editImages.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-sm overflow-hidden border border-border group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-16 h-16 rounded-sm border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
                    <Upload size={14} />
                    <span className="text-[9px]">{uploading ? '上传中' : '添加图片'}</span>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <Progress value={uploadProgress} className="h-1.5" />
                )}
              </div>

              {/* 上架状态 */}
              <div className="flex items-center justify-between py-2 border-t border-border">
                <Label className="text-xs text-muted-foreground">是否允许前台展示</Label>
                <Switch checked={editForm.is_active} onCheckedChange={v => setEditForm(f => f ? { ...f, is_active: v } : f)} />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setEditItem(null); setEditForm(null); }}
                  className="h-8 px-3 text-xs border border-border" disabled={saving}>取消</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || uploading}
                  className="h-8 px-4 text-xs">
                  {saving ? <><Loader2 size={12} className="animate-spin mr-1.5" />保存中...</> : '保存修改'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ 弹窗：拒绝 ══ */}
      <Dialog open={!!rejectTarget} onOpenChange={o => { if (!o) setRejectTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">拒绝商品审核</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因（选填）" className="text-xs bg-muted border-border min-h-20 resize-none" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejectTarget(null)}
                className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={confirmReject}
                className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 border-0">确认拒绝</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ 弹窗：删除确认 ══ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">确认删除商品？</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              将删除「{deleteTarget?.title}」，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}
              className="h-8 text-xs bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ 弹窗：批量操作确认 ══ */}
      <AlertDialog open={!!batchDialog} onOpenChange={o => { if (!o) setBatchDialog(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {batchDialog === 'delete' ? '确认批量删除？' : '确认批量下架？'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {batchDialog === 'delete'
                ? `将删除选中的 ${checkedIds.size} 件商品，此操作不可恢复。`
                : `将下架选中的 ${checkedIds.size} 件商品，用户端将不再显示。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" disabled={batchLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDialog && executeBatch(batchDialog)}
              disabled={batchLoading}
              className={`h-8 text-xs ${batchDialog === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}`}>
              {batchLoading ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
              {batchDialog === 'delete' ? '批量删除' : '批量下架'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
