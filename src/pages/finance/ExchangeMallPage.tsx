// 代金券兑换商城管理：商品卡片管理 / 图片上传 / Banner配置 / 兑换订单审核 / 代金券兑换审核
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Plus, Pencil, ToggleLeft, ToggleRight,
  ShoppingBag, ClipboardList, RefreshCw, CheckCircle2, XCircle,
  Upload, ImageIcon, Package, Trash2, Image, Save, Wallet,
} from 'lucide-react';

interface ExchangeItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  stock: number;
  exchanged: number;
  is_active: boolean;
  sort_order: number;
  min_coupon_balance: number;
  min_direct_referrals: number;
  created_at: string;
}

interface ExchangeOrder {
  id: string;
  user_id: string;
  item_id: string;
  points_spent: number;
  status: string;
  remark: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  user?: { phone: string; nickname: string } | null;
  item?: { name: string } | null;
}

interface VoucherRedeemRequest {
  id: string;
  user_id: string;
  amount: number;
  pool_snapshot: number;
  direct_count: number;
  status: string;
  reject_reason: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  user?: { phone: string; nickname: string } | null;
}

const BLANK_FORM = {
  name: '', description: '', image_url: '',
  points_cost: '', stock: '', sort_order: '0',
  min_coupon_balance: '3776', min_direct_referrals: '3',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '待审核', approved: '已批准', shipped: '已发货', completed: '已完成', rejected: '已拒绝',
};
const ORDER_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-300',
  approved: 'bg-blue-500/10 text-blue-700 border-blue-300',
  shipped: 'bg-purple-500/10 text-purple-700 border-purple-300',
  completed: 'bg-green-500/10 text-green-700 border-green-300',
  rejected: 'bg-destructive/10 text-destructive border-destructive/30',
};

// 图片压缩至 1 MB 以下（WEBP/1080p/0.8质量，自动降级）
async function compressImage(file: File): Promise<{ blob: Blob; compressed: boolean; sizeKB: number }> {
  const MAX = 1024 * 1024;
  if (file.size <= MAX) return { blob: file, compressed: false, sizeKB: Math.round(file.size / 1024) };
  return new Promise(resolve => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let quality = 0.8;
      const maxPx = 1080;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { resolve({ blob: file, compressed: false, sizeKB: Math.round(file.size / 1024) }); return; }
          if (blob.size <= MAX || quality <= 0.3) {
            resolve({ blob, compressed: true, sizeKB: Math.round(blob.size / 1024) });
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, 'image/webp', quality);
      };
      tryCompress();
    };
    img.src = url;
  });
}

export default function ExchangeMallPage() {
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [voucherRequests, setVoucherRequests] = useState<VoucherRedeemRequest[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingVouchers, setLoadingVouchers] = useState(true);
  const [processingVoucherId, setProcessingVoucherId] = useState<string | null>(null);

  // 商品弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ExchangeItem | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // 商品图片上传
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Banner 配置
  const [banner, setBanner] = useState({ title: '代金券兑换商城', subtitle: '用代金券换好礼', image: '', bg_color: '#6366f1' });
  const [bannerSaving, setBannerSaving] = useState(false);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerProgress, setBannerProgress] = useState(0);

  // 订单操作
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadItems() {
    setLoadingItems(true);
    const { data } = await supabase.from('exchange_items').select('*').order('sort_order').order('created_at', { ascending: false });
    setItems((data as ExchangeItem[]) ?? []);
    setLoadingItems(false);
  }

  async function loadOrders() {
    setLoadingOrders(true);
    const { data } = await supabase
      .from('exchange_orders')
      .select('*,user:users(phone,nickname),item:exchange_items(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data as ExchangeOrder[]) ?? []);
    setLoadingOrders(false);
  }

  async function loadVoucherRequests() {
    setLoadingVouchers(true);
    const { data } = await supabase
      .from('voucher_redeem_requests')
      .select('*,user:users(phone,nickname)')
      .order('created_at', { ascending: false })
      .limit(100);
    setVoucherRequests((data as VoucherRedeemRequest[]) ?? []);
    setLoadingVouchers(false);
  }

  async function handleVoucherAction(req: VoucherRedeemRequest, action: 'approved' | 'rejected', note?: string) {
    setProcessingVoucherId(req.id);
    const { error } = await supabase.from('voucher_redeem_requests').update({
      status: action,
      reviewer_note: note ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    setProcessingVoucherId(null);
    if (error) { toast.error('操作失败'); return; }
    toast.success(action === 'approved' ? '已批准代金券兑换申请' : '已拒绝申请');
    loadVoucherRequests();
  }

  async function loadBanner() {
    const { data } = await supabase.from('exchange_settings').select('key,value');
    if (!data) return;
    const m: Record<string, string> = {};
    data.forEach(r => { m[r.key] = r.value; });
    setBanner({
      title: m['banner_title'] ?? '代金券兑换商城',
      subtitle: m['banner_subtitle'] ?? '用代金券换好礼',
      image: m['banner_image'] ?? '',
      bg_color: m['banner_bg_color'] ?? '#6366f1',
    });
  }

  useEffect(() => { loadItems(); loadOrders(); loadBanner(); loadVoucherRequests(); }, []);

  // banner图片上传
  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true); setBannerProgress(10);
    const { blob, compressed, sizeKB } = await compressImage(file);
    setBannerProgress(40);
    const ext = compressed ? 'webp' : (file.name.split('.').pop() ?? 'jpg');
    const filename = `banner-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('exchange-images').upload(filename, blob, {
      contentType: compressed ? 'image/webp' : file.type, upsert: false,
    });
    setBannerProgress(90); setBannerUploading(false);
    if (error) { toast.error('Banner图片上传失败'); setBannerProgress(0); return; }
    const { data: { publicUrl } } = supabase.storage.from('exchange-images').getPublicUrl(data.path);
    setBanner(b => ({ ...b, image: publicUrl }));
    setBannerProgress(100);
    if (compressed) toast.success(`Banner已压缩上传（${sizeKB} KB）`);
    else toast.success(`Banner上传成功（${sizeKB} KB）`);
  }

  async function saveBanner() {
    setBannerSaving(true);
    const upserts = [
      { key: 'banner_title',    value: banner.title },
      { key: 'banner_subtitle', value: banner.subtitle },
      { key: 'banner_image',    value: banner.image },
      { key: 'banner_bg_color', value: banner.bg_color },
    ];
    const { error } = await supabase.from('exchange_settings').upsert(upserts, { onConflict: 'key' });
    setBannerSaving(false);
    if (error) { toast.error('保存失败'); return; }
    toast.success('Banner配置已保存，前端即时生效');
  }

  function openCreate() {
    setEditItem(null);
    setForm(BLANK_FORM);
    setPreviewUrl(null);
    setUploadProgress(0);
    setDialogOpen(true);
  }

  function openEdit(item: ExchangeItem) {
    setEditItem(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      image_url: item.image_url ?? '',
      points_cost: String(item.points_cost),
      stock: String(item.stock),
      sort_order: String(item.sort_order),
      min_coupon_balance: String(item.min_coupon_balance),
      min_direct_referrals: String(item.min_direct_referrals),
    });
    setPreviewUrl(item.image_url ?? null);
    setUploadProgress(0);
    setDialogOpen(true);
  }

  // 商品图片上传处理
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    if (!ALLOWED.includes(file.type)) { toast.error('仅支持 JPG / PNG / WEBP / GIF / AVIF 格式'); return; }
    setUploading(true); setUploadProgress(10);
    const { blob, compressed, sizeKB } = await compressImage(file);
    setUploadProgress(40);
    const ext = compressed ? 'webp' : file.name.split('.').pop() ?? 'jpg';
    const filename = `item-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from('exchange-images').upload(filename, blob, {
      contentType: compressed ? 'image/webp' : file.type, upsert: false,
    });
    setUploadProgress(90); setUploading(false);
    if (error) { toast.error('图片上传失败：' + error.message); setUploadProgress(0); return; }
    const { data: { publicUrl } } = supabase.storage.from('exchange-images').getPublicUrl(data.path);
    setForm(f => ({ ...f, image_url: publicUrl }));
    setPreviewUrl(publicUrl);
    setUploadProgress(100);
    if (compressed) toast.success(`图片已压缩并上传（${sizeKB} KB）`);
    else toast.success(`图片上传成功（${sizeKB} KB）`);
  }

  function clearImage() {
    setForm(f => ({ ...f, image_url: '' }));
    setPreviewUrl(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('请填写商品名称'); return; }
    const cost = parseInt(form.points_cost);
    const stock = parseInt(form.stock);
    if (isNaN(cost) || cost <= 0) { toast.error('代金券消耗必须大于0'); return; }
    if (isNaN(stock) || stock < 0) { toast.error('库存不能为负数'); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      image_url: form.image_url || null,
      points_cost: cost,
      stock,
      sort_order: parseInt(form.sort_order) || 0,
      min_coupon_balance: parseInt(form.min_coupon_balance) || 3776,
      min_direct_referrals: parseInt(form.min_direct_referrals) || 3,
    };
    setSaving(true);
    if (editItem) {
      const { error } = await supabase.from('exchange_items').update(payload).eq('id', editItem.id);
      setSaving(false);
      if (error) { toast.error('更新失败'); return; }
      toast.success('商品已更新');
    } else {
      const { error } = await supabase.from('exchange_items').insert({ ...payload, is_active: true });
      setSaving(false);
      if (error) { toast.error('创建失败'); return; }
      toast.success('商品已创建');
    }
    setDialogOpen(false);
    loadItems();
  }

  async function toggleActive(item: ExchangeItem) {
    const { error } = await supabase.from('exchange_items').update({ is_active: !item.is_active }).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success(item.is_active ? '已下架' : '已上架');
    loadItems();
  }

  async function handleDeleteItem(item: ExchangeItem) {
    if (!confirm(`确定删除商品「${item.name}」？此操作不可恢复。`)) return;
    const { error } = await supabase.from('exchange_items').delete().eq('id', item.id);
    if (error) { toast.error('删除失败'); return; }
    toast.success('商品已删除');
    loadItems();
  }

  async function handleOrderAction(order: ExchangeOrder, action: 'approved' | 'shipped' | 'completed' | 'rejected') {
    setProcessingId(order.id);
    const { error } = await supabase.from('exchange_orders').update({
      status: action,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
    }).eq('id', order.id);
    setProcessingId(null);
    if (error) { toast.error('操作失败'); return; }
    toast.success(`订单已${ORDER_STATUS_LABELS[action]}`);
    loadOrders();
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const pendingVoucherCount = voucherRequests.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout>
      <PageHeader
        title="代金券兑换商城"
        description="管理兑换商品及审核用户兑换申请"
        action={
          <Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1">
            <Plus size={13} />添加商品
          </Button>
        }
      />

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="items" className="text-xs h-7 gap-1"><ShoppingBag size={12} />兑换商品 ({items.length})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs h-7 gap-1">
            <ClipboardList size={12} />代金券兑换订单
            {pendingCount > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-primary text-primary-foreground">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="voucher" className="text-xs h-7 gap-1">
            <Wallet size={12} />代金券兑换审核
            {pendingVoucherCount > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-destructive text-destructive-foreground">{pendingVoucherCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="banner" className="text-xs h-7 gap-1"><Image size={12} />Banner配置</TabsTrigger>
        </TabsList>

        {/* ── 商品卡片网格 ── */}
        <TabsContent value="items">
          {loadingItems ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg h-64 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
              <ShoppingBag size={40} className="opacity-25" />
              <p className="text-sm">暂无兑换商品</p>
              <Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1 mt-1">
                <Plus size={12} />立即添加第一件商品
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map(item => (
                <div key={item.id} className={`bg-card border rounded-lg overflow-hidden flex flex-col ${item.is_active ? 'border-border' : 'border-border opacity-60'}`}>
                  {/* 商品图 */}
                  <div className="relative aspect-square bg-muted">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Package size={32} className="text-muted-foreground/40" /></div>}
                    {/* 状态标签 */}
                    <span className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded border font-medium ${item.is_active ? 'bg-green-500/90 text-white border-transparent' : 'bg-muted/90 text-muted-foreground border-border'}`}>
                      {item.is_active ? '上架中' : '已下架'}
                    </span>
                  </div>
                  {/* 信息 */}
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">{item.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">{item.points_cost.toLocaleString()} 分</span>
                      <span className="text-[10px] text-muted-foreground">库存 {item.stock}</span>
                    </div>
                    {/* 前置条件 */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">前置条件：</p>
                      <p className="text-[10px] text-muted-foreground">券≥{item.min_coupon_balance.toLocaleString()} · 直推≥{item.min_direct_referrals}人</p>
                    </div>
                    {/* 操作 */}
                    <div className="flex gap-1 mt-auto pt-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}
                        className="flex-1 h-7 text-xs border border-border gap-1">
                        <Pencil size={10} />编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(item)}
                        className={`flex-1 h-7 text-xs border border-border gap-1 ${item.is_active ? 'text-muted-foreground' : 'text-green-600'}`}>
                        {item.is_active ? <><ToggleLeft size={10} />下架</> : <><ToggleRight size={10} />上架</>}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item)}
                        className="h-7 w-7 p-0 border border-border text-destructive hover:bg-destructive/10">
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {/* 添加占位卡 */}
              <button onClick={openCreate}
                className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors aspect-square md:aspect-auto md:min-h-48">
                <Plus size={24} />
                <span className="text-xs">添加商品</span>
              </button>
            </div>
          )}
        </TabsContent>

        {/* ── 兑换订单 ── */}
        <TabsContent value="orders">
          <div className="bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['用户', '兑换商品', '消耗代金券', '申请时间', '状态', '操作'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingOrders ? (
                  <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">暂无兑换记录</td></tr>
                ) : orders.map((order, i) => (
                  <tr key={order.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium">{order.user?.nickname || '-'}</p>
                      <p className="text-xs text-muted-foreground">{order.user?.phone}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium">{order.item?.name ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium text-primary">{order.points_spent.toLocaleString()} 分</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge className={`text-xs border ${ORDER_STATUS_COLOR[order.status] ?? ''}`}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        {processingId === order.id ? (
                          <RefreshCw size={13} className="animate-spin text-muted-foreground" />
                        ) : order.status === 'pending' ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleOrderAction(order, 'approved')}
                              className="h-6 px-2 text-xs border border-border text-green-600 hover:bg-green-500/10 gap-1">
                              <CheckCircle2 size={11} />批准
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOrderAction(order, 'rejected')}
                              className="h-6 px-2 text-xs border border-border text-destructive hover:bg-destructive/10 gap-1">
                              <XCircle size={11} />拒绝
                            </Button>
                          </>
                        ) : order.status === 'approved' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleOrderAction(order, 'shipped')}
                            className="h-6 px-2 text-xs border border-border gap-1">发货</Button>
                        ) : order.status === 'shipped' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleOrderAction(order, 'completed')}
                            className="h-6 px-2 text-xs border border-border gap-1">完成</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        {/* ── 代金券兑换审核 ── */}
        <TabsContent value="voucher">
          <div className="bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['用户', '申请金额', '资金池快照', '直推人数', '申请时间', '状态', '操作'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingVouchers ? (
                  <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
                ) : voucherRequests.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无代金券兑换申请</td></tr>
                ) : voucherRequests.map((req, i) => (
                  <tr key={req.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium">{req.user?.nickname || '-'}</p>
                      <p className="text-xs text-muted-foreground">{req.user?.phone}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap font-bold text-primary">¥{req.amount.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">¥{req.pool_snapshot.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      <span className={`font-medium ${req.direct_count >= 3 ? 'text-green-600' : 'text-destructive'}`}>{req.direct_count} 人</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(req.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge className={`text-xs border ${req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-700 border-yellow-300' : req.status === 'approved' ? 'bg-green-500/10 text-green-700 border-green-300' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
                        {req.status === 'pending' ? '待审核' : req.status === 'approved' ? '已批准' : '已拒绝'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {processingVoucherId === req.id ? (
                        <RefreshCw size={13} className="animate-spin text-muted-foreground" />
                      ) : req.status === 'pending' ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleVoucherAction(req, 'approved')}
                            className="h-6 px-2 text-xs border border-border text-green-700 hover:bg-green-500/10 gap-1">
                            <CheckCircle2 size={11} />批准
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleVoucherAction(req, 'rejected')}
                            className="h-6 px-2 text-xs border border-border text-destructive hover:bg-destructive/10 gap-1">
                            <XCircle size={11} />拒绝
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('zh-CN') : '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Banner 配置 ── */}
        <TabsContent value="banner">
          <div className="max-w-xl space-y-5">
            {/* 预览 */}
            <div className="rounded-xl overflow-hidden border border-border">
              <div
                className="relative min-h-28 flex flex-col justify-end p-5"
                style={{ background: banner.image ? `url(${banner.image}) center/cover` : banner.bg_color }}
              >
                {banner.image && <div className="absolute inset-0 bg-black/40 rounded-xl" />}
                <div className="relative z-10">
                  <p className="text-white font-bold text-lg leading-tight text-balance">{banner.title || '代金券兑换商城'}</p>
                  <p className="text-white/80 text-xs mt-0.5">{banner.subtitle || '副标题'}</p>
                </div>
                <span className="absolute top-2 right-2 text-[10px] bg-black/40 text-white px-2 py-0.5 rounded z-10">前端预览</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              {/* 标题 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Banner 标题</Label>
                <Input value={banner.title} onChange={e => setBanner(b => ({ ...b, title: e.target.value }))}
                  placeholder="代金券兑换商城" className="h-8 text-xs bg-muted border-border" />
              </div>
              {/* 副标题 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">副标题</Label>
                <Input value={banner.subtitle} onChange={e => setBanner(b => ({ ...b, subtitle: e.target.value }))}
                  placeholder="用代金券换好礼，感谢您的支持" className="h-8 text-xs bg-muted border-border" />
              </div>
              {/* 背景色 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">背景颜色（无图时生效）</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={banner.bg_color}
                    onChange={e => setBanner(b => ({ ...b, bg_color: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5" />
                  <Input value={banner.bg_color} onChange={e => setBanner(b => ({ ...b, bg_color: e.target.value }))}
                    className="h-8 text-xs bg-muted border-border flex-1" placeholder="#6366f1" />
                </div>
              </div>
              {/* Banner 图片上传 */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Banner 背景图片（可选，优先于背景色）</Label>
                <div className="flex gap-3 items-start">
                  <div className="w-20 h-14 rounded-lg border border-dashed border-border bg-muted shrink-0 flex items-center justify-center overflow-hidden">
                    {banner.image
                      ? <img src={banner.image} alt="banner" className="w-full h-full object-cover" />
                      : <ImageIcon size={18} className="text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input ref={bannerFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      className="hidden" onChange={handleBannerFile} />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => bannerFileRef.current?.click()} disabled={bannerUploading}
                        className="h-7 text-xs border-border gap-1 flex-1">
                        <Upload size={11} />{bannerUploading ? '上传中...' : banner.image ? '重新上传' : '上传图片'}
                      </Button>
                      {banner.image && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => setBanner(b => ({ ...b, image: '' }))}
                          className="h-7 text-xs border border-border text-destructive hover:bg-destructive/10">
                          <XCircle size={11} />清除
                        </Button>
                      )}
                    </div>
                    {bannerProgress > 0 && bannerProgress < 100 && (
                      <Progress value={bannerProgress} className="h-1" />
                    )}
                    <p className="text-[10px] text-muted-foreground">建议比例 4:1 · 超过1MB自动压缩</p>
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={saveBanner} disabled={bannerSaving} className="h-8 px-6 text-xs gap-1.5">
              {bannerSaving ? <><RefreshCw size={11} className="animate-spin" />保存中...</> : <><Save size={11} />保存Banner配置</>}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── 商品添加/编辑弹窗 ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editItem ? '编辑兑换商品' : '添加兑换商品'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* 图片上传区 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">商品图片</Label>
              <div className="flex gap-3 items-start">
                {/* 预览 */}
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border bg-muted shrink-0 flex items-center justify-center overflow-hidden relative">
                  {previewUrl
                    ? <img src={previewUrl} alt="预览" className="w-full h-full object-cover" />
                    : <ImageIcon size={24} className="text-muted-foreground/40" />}
                  {previewUrl && (
                    <button onClick={clearImage}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/90 text-white flex items-center justify-center hover:bg-destructive">
                      <XCircle size={12} />
                    </button>
                  )}
                </div>
                {/* 上传区 */}
                <div className="flex-1 space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    className="hidden" onChange={handleFileSelect} />
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="h-8 text-xs border-border gap-1.5 w-full">
                    <Upload size={12} />
                    {uploading ? '上传中...' : previewUrl ? '重新上传' : '点击上传图片'}
                  </Button>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <Progress value={uploadProgress} className="h-1.5" />
                  )}
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    支持 JPG / PNG / WEBP / GIF · 超过 1MB 自动压缩
                  </p>
                </div>
              </div>
            </div>

            {/* 基本信息 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">商品名称 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：精品茶叶礼盒" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">商品描述</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="简短描述商品特点（可选）" className="text-xs bg-muted border-border resize-none h-16" />
            </div>

            {/* 参数设置 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">所需代金券 *</Label>
                <Input type="number" min={1} value={form.points_cost}
                  onChange={e => setForm(f => ({ ...f, points_cost: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">库存数量 *</Label>
                <Input type="number" min={0} value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">排序权重</Label>
                <Input type="number" min={0} value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
            </div>

            {/* 前置兑换条件 */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">前置兑换条件（用户须同时满足以下两项）</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">优惠券余额 ≥</Label>
                  <div className="relative">
                    <Input type="number" min={0} value={form.min_coupon_balance}
                      onChange={e => setForm(f => ({ ...f, min_coupon_balance: e.target.value }))}
                      className="h-8 text-xs bg-muted border-border pr-8" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">元</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">直接推荐人数 ≥</Label>
                  <div className="relative">
                    <Input type="number" min={0} value={form.min_direct_referrals}
                      onChange={e => setForm(f => ({ ...f, min_direct_referrals: e.target.value }))}
                      className="h-8 text-xs bg-muted border-border pr-8" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">人</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                默认值：优惠券余额 ≥ 3776 · 直接推荐 ≥ 3 人
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="h-8 text-xs border-border">取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || uploading} className="h-8 px-5 text-xs gap-1">
              {saving ? <><RefreshCw size={11} className="animate-spin" />保存中...</> : `${editItem ? '保存修改' : '创建商品'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
