import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, ImageIcon, Camera, ImagePlus, RefreshCw } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

export default function MPaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [orderNo, setOrderNo] = useState('');
  const [amount, setAmount] = useState(0);
  const [sellerInfo, setSellerInfo] = useState<{ real_name: string | null; nickname: string; phone: string; kyc_status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherPreview, setVoucherPreview] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const camInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orderId) return;
    supabase.from('orders')
      .select('order_no,amount,seller:users!seller_id(real_name,nickname,phone,kyc_status)')
      .eq('id', orderId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setOrderNo((data as any).order_no);
          setAmount((data as any).amount);
          setSellerInfo((data as any).seller);
        }
        setLoading(false);
      });
  }, [orderId]);

  const handleFileSelect = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('图片不能超过 10MB'); return; }
    setVoucherFile(file);
    setVoucherPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!voucherFile) { toast.error('请上传付款凭证截图'); return; }
    if (!mobileUser) { navigate('/m/login'); return; }
    setSubmitting(true);
    try {
      const ext = voucherFile.name.split('.').pop() ?? 'jpg';
      const path = `${mobileUser.id}/${orderId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-vouchers')
        .upload(path, voucherFile, { upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('payment-vouchers').getPublicUrl(path);

      const { error } = await supabase.from('orders').update({
        status: 'payment_uploaded',
        payment_voucher_url: urlData.publicUrl,
        payment_time: new Date().toISOString(),
      }).eq('id', orderId);
      if (error) throw new Error(error.message);

      await supabase.from('order_status_logs').insert({
        order_id: orderId, from_status: 'pending_payment', to_status: 'payment_uploaded',
        operator_type: 'buyer', operator_id: mobileUser.id, remark: '买方上传付款凭证',
      });
      toast.success('付款凭证已提交，等待卖方确认');
      navigate(`/m/order/${orderId}`);
    } catch (e: any) {
      toast.error('提交失败：' + (e?.message ?? '请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="" back />
      <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="上传付款凭证" back />

      <div className="px-4 py-6 space-y-4">
        {/* 订单信息 */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">订单号</span>
            <span className="text-foreground font-mono text-xs">{orderNo}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">付款金额</span>
            <span className="text-primary font-bold text-base">¥{amount.toLocaleString()}</span>
          </div>
          {sellerInfo && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">收款方</span>
              <span className="text-foreground">{sellerInfo.kyc_status === 'approved' && sellerInfo.real_name ? sellerInfo.real_name : sellerInfo.nickname}（{sellerInfo.phone}）</span>
            </div>
          )}
        </div>

        {/* 付款说明 */}
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-medium text-foreground">付款注意事项</p>
          {[
            '请通过私域渠道（微信/支付宝/银行转账）向卖方付款',
            '付款时请备注订单号，便于卖方核对',
            '付款完成后，截图付款记录并上传凭证',
            '卖方确认收款后订单自动完成',
          ].map((tip, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">{i + 1}.</span>{tip}
            </p>
          ))}
        </div>

        {/* 凭证上传区 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">上传付款截图 *</h3>

          {/* 隐藏 input：相册 */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
          {/* 隐藏 input：拍照 */}
          <input ref={camInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />

          {/* 预览 */}
          <div
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-2 overflow-hidden cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {voucherPreview ? (
              <img src={voucherPreview} alt="凭证预览" className="w-full h-full object-contain" />
            ) : (
              <>
                <ImageIcon size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">点击选择图片</p>
              </>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => camInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 active:bg-primary/30 transition-colors"
            >
              <Camera size={15} />拍照上传
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-muted/60 text-foreground text-sm font-medium hover:bg-muted/80 active:bg-muted transition-colors"
            >
              {voucherPreview ? <RefreshCw size={15} /> : <ImagePlus size={15} />}
              {voucherPreview ? '重新选择' : '相册上传'}
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-3">
        <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={submitting || !voucherFile}>
          <Upload size={16} className="mr-2" />
          {submitting ? '提交中...' : '提交付款凭证'}
        </Button>
      </div>
    </div>
  );
}
