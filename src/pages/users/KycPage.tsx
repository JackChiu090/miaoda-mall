import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  CheckCircle, XCircle, Eye, Zap, Search,
  RefreshCw, ImageOff,
} from 'lucide-react';
import type { KycApplication } from '@/types/types';

const PAGE_SIZE = 20;

type TabKey = 'pending' | 'approved' | 'rejected' | 'all';

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: 'pending',  label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all',      label: '全部' },
];

export default function KycPage() {
  const [tab, setTab]             = useState<TabKey>('pending');
  const [items, setItems]         = useState<KycApplication[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [counts, setCounts]       = useState<Record<TabKey, number>>({ pending: 0, approved: 0, rejected: 0, all: 0 });

  const [selected, setSelected]   = useState<KycApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDialog, setRejectDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState<string | null>(null);  // 正在自动审核的id
  const [batchAutoLoading, setBatchAutoLoading] = useState(false);

  async function fetchCounts() {
    const [p, a, r, all] = await Promise.all([
      supabase.from('kyc_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('kyc_applications').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('kyc_applications').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('kyc_applications').select('id', { count: 'exact', head: true }),
    ]);
    setCounts({ pending: p.count ?? 0, approved: a.count ?? 0, rejected: r.count ?? 0, all: all.count ?? 0 });
  }

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from('kyc_applications')
      .select('*, user:user_id(phone, nickname)', { count: 'exact' })
      .order('created_at', { ascending: tab === 'pending' })
      .range(from, from + PAGE_SIZE - 1);
    if (tab !== 'all') query = query.eq('status', tab);
    if (search.trim()) {
      query = query.or(`real_name.ilike.%${search.trim()}%,id_card_no.ilike.%${search.trim()}%`);
    }
    const { data, count, error } = await query;
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  useEffect(() => { fetchCounts(); }, []);
  useEffect(() => { setPage(1); }, [tab, search]);
  useEffect(() => { fetchItems(); }, [tab, page, search]);

  async function handleApprove(item: KycApplication) {
    const { error } = await supabase.from('kyc_applications')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    // 同步更新 kyc_status + 昵称为真实姓名 + users.real_name
    await supabase.from('users')
      .update({ kyc_status: 'approved', nickname: item.real_name, real_name: item.real_name })
      .eq('id', item.user_id);
    toast.success('认证审核通过');
    fetchItems(); fetchCounts();
  }

  async function confirmReject() {
    if (!selected) return;
    const { error } = await supabase.from('kyc_applications')
      .update({ status: 'rejected', reject_reason: rejectReason || '材料不符合要求', reviewed_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) { toast.error('操作失败'); return; }
    await supabase.from('users').update({ kyc_status: 'rejected' }).eq('id', selected.user_id);
    toast.success('已拒绝认证申请');
    setRejectDialog(false);
    fetchItems(); fetchCounts();
  }

  // 单条自动审核：调用 OCR 对两张图片进行识别，比对姓名+证件号是否一致
  async function handleAutoVerify(item: KycApplication) {
    if (!item.front_image_url) {
      toast.warning('该申请缺少证件照片，无法自动审核');
      return;
    }
    setAutoVerifying(item.id);
    try {
      const { data: ocrData, error: ocrErr } = await supabase.functions.invoke('id-card-ocr', {
        body: { id_card_side: 'front', url: item.front_image_url },
      });
      if (ocrErr) throw ocrErr;
      // 自托管未配置 OCR：提示管理员手动审核，不报错
      if (ocrData?.reason === 'ocr_not_configured') {
        toast.info('OCR 自动审核未配置，请手动审核该申请');
        return;
      }
      const words = ocrData?.words_result ?? {};
      const ocrName   = (words['姓名']?.words ?? '').trim();
      const ocrCardNo = (words['公民身份号码']?.words ?? '').trim().toUpperCase();
      const match = ocrName === item.real_name.trim() && ocrCardNo === item.id_card_no.toUpperCase();

      // 保存 OCR 结果
      await supabase.from('kyc_applications').update({
        ocr_result:      ocrData?.words_result ?? {},
        auto_verified:   true,
        auto_verify_msg: match ? '自动比对通过' : `姓名或证件号不匹配（OCR: ${ocrName} / ${ocrCardNo}）`,
        ...(match ? { status: 'approved', reviewed_at: new Date().toISOString() } : {}),
      }).eq('id', item.id);

      if (match) {
        await supabase.from('users')
          .update({ kyc_status: 'approved', nickname: item.real_name, real_name: item.real_name })
          .eq('id', item.user_id);
        toast.success(`自动审核通过：${item.real_name}`);
      } else {
        toast.warning(`自动审核不匹配：${item.real_name}，需手动复核`);
      }
      fetchItems(); fetchCounts();
    } catch {
      toast.error('自动审核调用失败，请稍后重试');
    } finally {
      setAutoVerifying(null);
    }
  }

  // 批量自动审核待审核申请（有图片的）
  async function handleBatchAutoVerify() {
    const withImages = items.filter(i => i.status === 'pending' && i.front_image_url);
    if (withImages.length === 0) { toast.info('当前页无可自动审核的待审核申请'); return; }
    setBatchAutoLoading(true);
    let passCount = 0, failCount = 0;
    for (const item of withImages) {
      try {
        const { data: ocrData } = await supabase.functions.invoke('id-card-ocr', {
          body: { id_card_side: 'front', url: item.front_image_url },
        });
        // 自托管未配置 OCR：跳过批量自动审核
        if (ocrData?.reason === 'ocr_not_configured') {
          toast.info('OCR 自动审核未配置，请手动审核');
          return;
        }
        const words = ocrData?.words_result ?? {};
        const ocrName   = (words['姓名']?.words ?? '').trim();
        const ocrCardNo = (words['公民身份号码']?.words ?? '').trim().toUpperCase();
        const match = ocrName === item.real_name.trim() && ocrCardNo === item.id_card_no.toUpperCase();
        await supabase.from('kyc_applications').update({
          ocr_result:      words,
          auto_verified:   true,
          auto_verify_msg: match ? '自动批量比对通过' : `不匹配（OCR: ${ocrName} / ${ocrCardNo}）`,
          ...(match ? { status: 'approved', reviewed_at: new Date().toISOString() } : {}),
        }).eq('id', item.id);
        if (match) {
          await supabase.from('users')
            .update({ kyc_status: 'approved', nickname: item.real_name, real_name: item.real_name })
            .eq('id', item.user_id);
          passCount++;
        } else {
          failCount++;
        }
      } catch { failCount++; }
    }
    setBatchAutoLoading(false);
    toast.success(`批量自动审核完成：通过 ${passCount} 条，需复核 ${failCount} 条`);
    fetchItems(); fetchCounts();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader
        title="实名认证审核"
        description="管理用户实名认证申请，支持手动审核和 OCR 自动核验"
      />

      {/* Tab + 搜索 + 操作栏 */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <Tabs value={tab} onValueChange={v => setTab(v as TabKey)}>
          <TabsList className="h-8">
            {TAB_LABELS.map(t => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs h-7 px-3 gap-1.5">
                {t.label}
                <Badge variant={t.key === 'pending' ? 'destructive' : 'secondary'} className="text-xs px-1.5 py-0 h-4">
                  {counts[t.key]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 md:ml-auto flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索姓名/证件号"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-44"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border"
            onClick={() => { fetchItems(); fetchCounts(); }} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />刷新
          </Button>
          {tab === 'pending' && (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleBatchAutoVerify} disabled={batchAutoLoading}>
              <Zap size={13} />{batchAutoLoading ? '批量审核中...' : '批量自动审核'}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['申请用户', '真实姓名', '身份证号', '证件照', '提交时间', '状态', '自动核验', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">暂无数据</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                {/* 用户 */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <div>
                    <p className="font-mono">{(item.user as any)?.phone ?? '-'}</p>
                    <p className="text-muted-foreground">{(item.user as any)?.nickname ?? ''}</p>
                  </div>
                </td>
                {/* 姓名 */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium">{item.real_name}</td>
                {/* 证件号（脱敏） */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                  {item.id_card_no.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2')}
                </td>
                {/* 证件照缩略图 */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    {item.front_image_url ? (
                      <img src={item.front_image_url} alt="正面" className="w-10 h-7 object-cover rounded border border-border cursor-pointer"
                        onClick={() => { setSelected(item); setDetailDialog(true); }} />
                    ) : (
                      <div className="w-10 h-7 rounded border border-dashed border-border flex items-center justify-center">
                        <ImageOff size={10} className="text-muted-foreground" />
                      </div>
                    )}
                    {item.back_image_url ? (
                      <img src={item.back_image_url} alt="背面" className="w-10 h-7 object-cover rounded border border-border cursor-pointer"
                        onClick={() => { setSelected(item); setDetailDialog(true); }} />
                    ) : (
                      <div className="w-10 h-7 rounded border border-dashed border-border flex items-center justify-center">
                        <ImageOff size={10} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </td>
                {/* 时间 */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                {/* 状态 */}
                <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                {/* 自动核验 */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {(item as any).auto_verified ? (
                    <span className="text-success text-xs">已核验</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">未核验</span>
                  )}
                </td>
                {/* 操作 */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(item); setDetailDialog(true); }}
                      className="h-6 px-2 text-xs border border-border">
                      <Eye size={11} className="mr-1" />查看
                    </Button>
                    {item.status === 'pending' && (
                      <>
                        <Button variant="ghost" size="sm"
                          onClick={() => handleAutoVerify(item)}
                          disabled={autoVerifying === item.id || !item.front_image_url}
                          className="h-6 px-2 text-xs border border-primary/40 text-primary hover:bg-primary/10">
                          <Zap size={11} className="mr-1" />{autoVerifying === item.id ? '核验中' : '自动'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleApprove(item)}
                          className="h-6 px-2 text-xs border border-success/40 text-success hover:bg-success/10">
                          <CheckCircle size={11} className="mr-1" />通过
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => { setSelected(item); setRejectReason(''); setRejectDialog(true); }}
                          className="h-6 px-2 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10">
                          <XCircle size={11} className="mr-1" />拒绝
                        </Button>
                      </>
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
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">实名认证详情</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/30 rounded-lg p-3">
                <div><p className="text-muted-foreground mb-1">申请用户</p><p className="font-mono">{(selected.user as any)?.phone}</p></div>
                <div><p className="text-muted-foreground mb-1">昵称</p><p>{(selected.user as any)?.nickname ?? '-'}</p></div>
                <div><p className="text-muted-foreground mb-1">真实姓名</p><p className="font-medium">{selected.real_name}</p></div>
                <div><p className="text-muted-foreground mb-1">身份证号</p><p className="font-mono text-xs">{selected.id_card_no}</p></div>
                <div><p className="text-muted-foreground mb-1">状态</p><StatusBadge status={selected.status} /></div>
                <div><p className="text-muted-foreground mb-1">自动核验</p>
                  <p className={(selected as any).auto_verified ? 'text-success' : 'text-muted-foreground'}>
                    {(selected as any).auto_verified ? '已核验' : '未核验'}
                  </p>
                </div>
                {(selected as any).auto_verify_msg && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground mb-1">核验结果</p>
                    <p className="text-xs">{(selected as any).auto_verify_msg}</p>
                  </div>
                )}
                {selected.reject_reason && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground mb-1">拒绝原因</p>
                    <p className="text-xs text-destructive">{selected.reject_reason}</p>
                  </div>
                )}
              </div>

              {/* 证件照片 */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">证件照片</p>
                <div className="grid grid-cols-2 gap-3">
                  {selected.front_image_url ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">身份证正面</p>
                      <img src={selected.front_image_url} alt="正面"
                        className="w-full aspect-[3/2] object-cover rounded-lg border border-border" />
                    </div>
                  ) : (
                    <div className="aspect-[3/2] rounded-lg border border-dashed border-border flex items-center justify-center">
                      <div className="text-center"><ImageOff size={20} className="text-muted-foreground mx-auto mb-1" /><p className="text-xs text-muted-foreground">未上传正面</p></div>
                    </div>
                  )}
                  {selected.back_image_url ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">身份证背面</p>
                      <img src={selected.back_image_url} alt="背面"
                        className="w-full aspect-[3/2] object-cover rounded-lg border border-border" />
                    </div>
                  ) : (
                    <div className="aspect-[3/2] rounded-lg border border-dashed border-border flex items-center justify-center">
                      <div className="text-center"><ImageOff size={20} className="text-muted-foreground mx-auto mb-1" /><p className="text-xs text-muted-foreground">未上传背面</p></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="ghost" onClick={() => setDetailDialog(false)}
                  className="h-7 px-3 text-xs border border-border">关闭</Button>
                {selected.status === 'pending' && (
                  <>
                    <Button size="sm" variant="ghost"
                      onClick={() => { handleAutoVerify(selected); setDetailDialog(false); }}
                      disabled={!selected.front_image_url}
                      className="h-7 px-3 text-xs border border-primary/40 text-primary hover:bg-primary/10">
                      <Zap size={11} className="mr-1" />自动审核
                    </Button>
                    <Button size="sm" onClick={() => { handleApprove(selected); setDetailDialog(false); }}
                      className="h-7 px-3 text-xs">通过审核</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 拒绝弹窗 */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">拒绝认证申请</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因（选填，默认：材料不符合要求）"
              className="text-xs bg-muted border-border min-h-20 resize-none" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejectDialog(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={confirmReject} className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 border-0">确认拒绝</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
