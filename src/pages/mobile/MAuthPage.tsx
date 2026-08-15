import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, CheckCircle, Clock, XCircle, ScanLine, Camera, ImagePlus } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

const MAX_SIZE = 1024 * 1024 * 5; // 5MB

// 将 File 压缩并转为 base64（去除前缀）
async function fileToBase64(file: File): Promise<string> {
  // 若超1MB先压缩为 webp
  let blob: Blob = file;
  if (file.size > 1024 * 1024) {
    blob = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        const maxDim = 1080;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('压缩失败')), 'image/webp', 0.8);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = url;
    });
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(blob);
  });
}

function safeFileName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
}

interface IdCardSlot {
  side: 'front' | 'back';
  label: string;
  hint: string;
}

const SLOTS: IdCardSlot[] = [
  { side: 'front', label: '证件正面', hint: '头像面（姓名/证件号）' },
  { side: 'back',  label: '证件背面', hint: '国徽面（签发机关）' },
];

export default function MAuthPage() {
  const { mobileUser, refreshUser } = useMobileUser();
  const navigate = useNavigate();

  const [realName, setRealName] = useState('');
  const [idCardNo, setIdCardNo] = useState('');
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile]   = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backPreview, setBackPreview]   = useState('');
  const [ocrLoading, setOcrLoading] = useState<'front' | 'back' | null>(null);
  const [ocrFailed, setOcrFailed] = useState(false);   // OCR 识别失败标记
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 正面：拍照 / 相册，背面：拍照 / 相册
  const frontCameraRef = useRef<HTMLInputElement>(null);
  const frontAlbumRef  = useRef<HTMLInputElement>(null);
  const backCameraRef  = useRef<HTMLInputElement>(null);
  const backAlbumRef   = useRef<HTMLInputElement>(null);

  const kycStatus = mobileUser?.kyc_status ?? 'unsubmitted';
  const canSubmit = kycStatus === 'unsubmitted' || kycStatus === 'rejected';

  // 选择图片 → 预览 → 自动 OCR
  const handleFileSelect = async (file: File, side: 'front' | 'back') => {
    if (file.size > MAX_SIZE) { toast.error('图片不能超过 5MB'); return; }
    const previewUrl = URL.createObjectURL(file);
    if (side === 'front') { setFrontFile(file); setFrontPreview(previewUrl); }
    else                  { setBackFile(file);  setBackPreview(previewUrl); }

    // 仅正面自动 OCR
    if (side !== 'front') return;
    setOcrLoading(side);
    setOcrFailed(false);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('id-card-ocr', {
        body: { id_card_side: side, image: base64 },
      });
      if (error) throw error;
      const words = data?.words_result ?? {};
      const name   = words['姓名']?.words ?? '';
      const cardNo = words['公民身份号码']?.words ?? '';
      if (name)   setRealName(name);
      if (cardNo) setIdCardNo(cardNo);
      if (name || cardNo) {
        toast.success('OCR 识别成功，已自动填写信息');
      } else {
        // 识别成功但没读到信息
        setOcrFailed(true);
        toast.warning('未能识别到身份信息，请手动填写');
      }
    } catch {
      setOcrFailed(true);
      toast.warning('OCR 识别失败，请手动填写姓名和身份证号');
    } finally {
      setOcrLoading(null);
    }
  };

  // 上传图片到 Supabase Storage，返回公开 URL
  async function uploadImage(file: File, side: 'front' | 'back'): Promise<string> {
    const blob = file.size > 1024 * 1024 ? await (async () => {
      const b64 = await fileToBase64(file);
      const res = await fetch(`data:image/webp;base64,${b64}`);
      return res.blob();
    })() : file;

    const fileName = safeFileName(`kyc-${side}`);
    const path = `${mobileUser!.id}/${fileName}`;
    const uploadFile = new File([blob], fileName, { type: 'image/webp' });

    const { error } = await supabase.storage.from('id-card-images').upload(path, uploadFile, {
      contentType: 'image/webp', upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('id-card-images').getPublicUrl(path);
    return data.publicUrl;
  }

  const handleSubmit = async () => {
    if (!mobileUser) { navigate('/m/login'); return; }
    if (!realName.trim())              { toast.error('请输入真实姓名'); return; }
    if (!/^\d{17}[\dXx]$/.test(idCardNo)) { toast.error('请输入正确的18位身份证号'); return; }
    if (!frontFile)                    { toast.error('请上传证件正面照片'); return; }
    if (!backFile)                     { toast.error('请上传证件背面照片'); return; }

    setSubmitting(true);
    setUploadProgress(5);
    try {
      setUploadProgress(20);
      const frontUrl = await uploadImage(frontFile, 'front');
      setUploadProgress(50);
      const backUrl = await uploadImage(backFile, 'back');
      setUploadProgress(75);

      const { error } = await supabase.from('kyc_applications').insert({
        user_id: mobileUser.id,
        real_name: realName.trim(),
        id_card_no: idCardNo.toUpperCase(),
        front_image_url: frontUrl,
        back_image_url:  backUrl,
        submitted_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      setUploadProgress(90);

      await supabase.from('users').update({ kyc_status: 'pending' }).eq('id', mobileUser.id);
      await refreshUser();
      setUploadProgress(100);
      toast.success('实名认证申请已提交，请等待审核');
    } catch (e: any) {
      toast.error('提交失败：' + (e?.message ?? '请重试'));
    } finally {
      setSubmitting(false);
      setTimeout(() => setUploadProgress(0), 800);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="实名认证" back />

      <div className="px-4 py-6 space-y-5">

        {/* 已通过 */}
        {kycStatus === 'approved' && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-8 text-center">
            <CheckCircle size={52} className="text-success mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">实名认证已通过</p>
            <p className="text-sm text-muted-foreground mt-1">您的身份信息已通过审核</p>
          </div>
        )}

        {/* 审核中 */}
        {kycStatus === 'pending' && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-8 text-center">
            <Clock size={52} className="text-warning mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">审核中</p>
            <p className="text-sm text-muted-foreground mt-1">您的认证申请正在审核中，请耐心等待</p>
          </div>
        )}

        {/* 被拒绝提示 */}
        {kycStatus === 'rejected' && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
            <XCircle size={20} className="text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">认证未通过</p>
              <p className="text-xs text-muted-foreground mt-0.5">请重新提交认证材料</p>
            </div>
          </div>
        )}

        {/* 表单区 */}
        {canSubmit && (
          <>
            {/* 身份证照片上传 */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ScanLine size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">上传证件照片</h2>
                <span className="text-xs text-muted-foreground ml-auto">支持 JPG/PNG，≤5MB</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {SLOTS.map(slot => {
                  const isLoading   = ocrLoading === slot.side;
                  const preview     = slot.side === 'front' ? frontPreview : backPreview;
                  const cameraRef   = slot.side === 'front' ? frontCameraRef : backCameraRef;
                  const albumRef    = slot.side === 'front' ? frontAlbumRef  : backAlbumRef;
                  const onChange    = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f, slot.side);
                    e.target.value = '';
                  };
                  return (
                    <div key={slot.side} className="flex flex-col gap-2">
                      {/* 预览区 */}
                      <div className="w-full aspect-[3/2] rounded-lg border-2 border-dashed border-border overflow-hidden relative bg-muted/20 flex flex-col items-center justify-center gap-1">
                        {preview ? (
                          <>
                            <img src={preview} alt={slot.label} className="absolute inset-0 w-full h-full object-cover" />
                            {isLoading && (
                              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1.5">
                                <ScanLine size={20} className="text-white animate-pulse" />
                                <span className="text-xs text-white">识别中...</span>
                              </div>
                            )}
                          </>
                        ) : isLoading ? (
                          <div className="flex flex-col items-center gap-1.5">
                            <ScanLine size={20} className="text-primary animate-pulse" />
                            <span className="text-xs text-primary">识别中...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <ImagePlus size={20} className="text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">{slot.label}</span>
                            <span className="text-[10px] text-muted-foreground">{slot.hint}</span>
                          </div>
                        )}
                      </div>

                      {/* 拍照 input — capture="environment" 直接调起摄像头 */}
                      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
                      {/* 相册 input — 无 capture，打开本地文件选择 */}
                      <input ref={albumRef}  type="file" accept="image/*" className="hidden" onChange={onChange} />

                      {/* 两个操作按钮 */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => cameraRef.current?.click()}
                          className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 active:bg-primary/80 transition-colors disabled:opacity-50"
                        >
                          <Camera size={13} />
                          {preview ? '重拍' : '拍照'}
                        </button>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => albumRef.current?.click()}
                          className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 active:bg-primary/30 transition-colors disabled:opacity-50"
                        >
                          <ImagePlus size={13} />
                          相册
                        </button>
                      </div>

                      <p className="text-[10px] text-center text-muted-foreground">{slot.label}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-primary/80 bg-primary/5 rounded-lg px-3 py-2">
                💡 上传正面照片后将自动识别姓名和身份证号
              </p>
              {/* OCR 失败提示 */}
              {ocrFailed && (
                <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
                  <span className="text-warning text-base leading-none mt-0.5">⚠️</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">自动识别失败</p>
                    <p className="text-xs text-muted-foreground mt-0.5">请在下方手动填写姓名和身份证号，或重新拍摄更清晰的照片</p>
                  </div>
                </div>
              )}
            </div>

            {/* 身份信息 */}
            <div className={`bg-card border rounded-xl p-4 space-y-4 ${ocrFailed ? 'border-warning/60' : 'border-border'}`}>
              <div className="flex items-center gap-2">
                <Upload size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">身份信息</h2>
                {ocrLoading === 'front' && (
                  <span className="text-xs text-primary ml-auto animate-pulse">OCR 识别中...</span>
                )}
                {ocrFailed && !ocrLoading && (
                  <span className="text-xs text-warning ml-auto">请手动填写</span>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">真实姓名 *</label>
                <Input
                  placeholder="请输入真实姓名"
                  className="h-11"
                  value={realName}
                  onChange={e => setRealName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">身份证号 *</label>
                <Input
                  placeholder="请输入18位身份证号"
                  className="h-11 font-mono tracking-wider"
                  value={idCardNo}
                  onChange={e => setIdCardNo(e.target.value.toUpperCase())}
                  maxLength={18}
                />
              </div>
            </div>

            {/* 上传进度 */}
            {uploadProgress > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>提交中...</span><span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}

            <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={submitting || ocrLoading !== null}>
              {submitting ? '提交中...' : '提交认证申请'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              请确保提交真实有效的身份信息，平台将严格保密您的个人资料
            </p>
          </>
        )}
      </div>
    </div>
  );
}
