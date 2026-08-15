// 交易凭证核查 - 管理员查看/核查所有买方付款凭证
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, RefreshCw, Eye, AlertTriangle, CheckCircle2, ZoomIn, ExternalLink } from 'lucide-react';

interface VoucherOrder {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  payment_voucher_url: string;
  payment_time: string | null;
  voucher_flagged: boolean;
  voucher_flag_note: string | null;
  created_at: string;
  buyer: { phone: string; nickname: string } | null;
  seller: { phone: string; nickname: string } | null;
}

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  payment_uploaded: '凭证待确认',
  confirmed: '已确认',
  completed: '已完成',
  disputed: '争议中',
  cancelled: '已取消',
};

export default function VoucherReviewPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<VoucherOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('all'); // all | flagged | normal

  // 凭证大图预览
  const [previewUrl, setPreviewUrl] = useState('');

  // 标记可疑 Dialog
  const [flagTarget, setFlagTarget] = useState<VoucherOrder | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [flagging, setFlagging] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase
      .from('orders')
      .select(
        'id,order_no,amount,status,payment_voucher_url,payment_time,voucher_flagged,voucher_flag_note,created_at,buyer:buyer_id(phone,nickname),seller:seller_id(phone,nickname)',
        { count: 'exact' }
      )
      .not('payment_voucher_url', 'is', null);

    if (search) q = q.ilike('order_no', `%${search}%`);
    if (flagFilter === 'flagged') q = q.eq('voucher_flagged', true);
    if (flagFilter === 'normal') q = q.eq('voucher_flagged', false);

    const { data, count, error } = await q
      .order('payment_time', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);

    setLoading(false);
    if (error) { toast.error('加载失败：' + error.message); return; }
    setList((data as unknown as VoucherOrder[]) ?? []);
    setTotal(count ?? 0);
  }, [page, search, flagFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 标记 / 取消标记
  async function handleFlag(order: VoucherOrder, flag: boolean) {
    if (flag) {
      // 打开弹窗填原因
      setFlagTarget(order);
      setFlagNote(order.voucher_flag_note ?? '');
      return;
    }
    // 直接取消标记
    const { error } = await supabase.from('orders').update({ voucher_flagged: false, voucher_flag_note: null }).eq('id', order.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已取消可疑标记');
    fetchList();
  }

  async function handleConfirmFlag() {
    if (!flagTarget) return;
    setFlagging(true);
    const { error } = await supabase.from('orders')
      .update({ voucher_flagged: true, voucher_flag_note: flagNote.trim() || null })
      .eq('id', flagTarget.id);
    setFlagging(false);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已标记为可疑凭证');
    setFlagTarget(null);
    fetchList();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const flaggedCount = list.filter(o => o.voucher_flagged).length;

  return (
    <AdminLayout>
      <PageHeader
        title="交易凭证核查"
        description="核查买方上传的所有付款凭证，对虚假/异常凭证进行标记复核"
      />

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-3 max-w-md mb-4">
        {[
          { label: '凭证总数', value: total, color: 'text-primary' },
          { label: '本页可疑', value: flaggedCount, color: 'text-destructive' },
          { label: '本页正常', value: list.length - flaggedCount, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-sm px-3 py-2.5">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-40 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索订单号" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-xs bg-muted border-border" />
        </div>
        <Select value={flagFilter} onValueChange={v => { setFlagFilter(v); setPage(1); }}>
          <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部凭证</SelectItem>
            <SelectItem value="flagged">可疑凭证</SelectItem>
            <SelectItem value="normal">正常凭证</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={fetchList} disabled={loading}
          className="h-8 text-xs gap-1.5 border-border">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />刷新
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">共 {total} 条</span>
      </div>

      {/* 凭证列表 */}
      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['付款凭证', '订单号', '买方', '卖方', '金额', '状态', '上传时间', '核查状态', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-xs text-muted-foreground">暂无付款凭证记录</td></tr>
            ) : list.map((o, i) => (
              <tr key={o.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                {/* 凭证缩略图 */}
                <td className="px-3 py-2">
                  <button
                    onClick={() => setPreviewUrl(o.payment_voucher_url)}
                    className="w-14 h-14 rounded border border-border overflow-hidden bg-muted flex items-center justify-center hover:opacity-80 transition-opacity relative group"
                  >
                    <img src={o.payment_voucher_url} alt="凭证" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center">
                      <ZoomIn size={16} className="text-white" />
                    </div>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-xs font-mono text-foreground whitespace-nowrap">
                  {o.order_no}
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-xs text-foreground">{o.buyer?.nickname ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{o.buyer?.phone ?? '—'}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-xs text-foreground">{o.seller?.nickname ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{o.seller?.phone ?? '—'}</p>
                </td>
                <td className="px-3 py-2.5 text-xs font-medium text-primary whitespace-nowrap">
                  ¥{Number(o.amount).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {o.payment_time
                    ? new Date(o.payment_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {o.voucher_flagged ? (
                    <div>
                      <Badge className="text-[10px] px-1.5 bg-destructive/10 text-destructive border border-destructive/30">
                        <AlertTriangle size={9} className="mr-0.5" />可疑
                      </Badge>
                      {o.voucher_flag_note && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-24 truncate">{o.voucher_flag_note}</p>
                      )}
                    </div>
                  ) : (
                    <Badge className="text-[10px] px-1.5 bg-green-500/10 text-green-700 border border-green-300">
                      <CheckCircle2 size={9} className="mr-0.5" />正常
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${o.id}`)}
                      className="h-6 px-2 text-xs border border-border gap-1">
                      <Eye size={11} />查看订单
                    </Button>
                    {o.voucher_flagged ? (
                      <Button variant="ghost" size="sm" onClick={() => handleFlag(o, false)}
                        className="h-6 px-2 text-xs border border-border gap-1 text-green-700 hover:bg-green-50">
                        <CheckCircle2 size={11} />取消标记
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleFlag(o, true)}
                        className="h-6 px-2 text-xs border border-border gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <AlertTriangle size={11} />标记可疑
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-7 text-xs border-border">上一页</Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-7 text-xs border-border">下一页</Button>
        </div>
      )}

      {/* 凭证大图预览 Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={open => { if (!open) setPreviewUrl(''); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border p-2">
          <DialogHeader className="px-2 pt-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <ZoomIn size={14} />付款凭证查看
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs border border-border gap-1">
                  <ExternalLink size={11} />原图
                </Button>
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[70vh] overflow-auto bg-muted rounded-sm">
            <img src={previewUrl} alt="付款凭证" className="max-w-full max-h-[70vh] object-contain" />
          </div>
        </DialogContent>
      </Dialog>

      {/* 标记可疑 Dialog */}
      <Dialog open={!!flagTarget} onOpenChange={open => { if (!open) setFlagTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertTriangle size={14} className="text-destructive" />标记可疑凭证
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {flagTarget?.payment_voucher_url && (
              <img src={flagTarget.payment_voucher_url} alt="凭证" className="w-full max-h-40 object-contain bg-muted rounded-sm border border-border" />
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">标记原因（选填）</Label>
              <Textarea value={flagNote} onChange={e => setFlagNote(e.target.value)}
                placeholder="如：凭证模糊、金额不符、疑似伪造..." rows={3}
                className="text-xs bg-muted border-border resize-none" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFlagTarget(null)} className="h-7 px-3 text-xs border border-border">取消</Button>
            <Button size="sm" onClick={handleConfirmFlag} disabled={flagging}
              className="h-7 px-4 text-xs bg-destructive hover:bg-destructive/90 text-white border-0 gap-1">
              {flagging ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
              确认标记
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
