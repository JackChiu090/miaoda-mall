import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Phone, Hash, Lock, Eye, EyeOff, FileText, ShieldCheck,
  PenLine, MapPin, ChevronRight, CheckCircle2, Loader2,
  Camera, IdCard, ImagePlus,
} from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { validateUserPassword } from '@/lib/passwordPolicy';

// ─── 步骤定义 ────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: '注册协议', icon: FileText },
  { id: 2, label: '实名认证', icon: ShieldCheck },
  { id: 3, label: '签约协议', icon: FileText },
  { id: 4, label: '手写签名', icon: PenLine },
  { id: 5, label: '收货地址', icon: MapPin },
];

// ─── 协议文本 ────────────────────────────────────────────────────
const REGISTER_AGREEMENT = `众泰商城用户注册协议

一、服务条款
本协议是用户（以下简称"您"）与众泰商城平台（以下简称"本平台"）之间关于使用本平台服务所订立的协议。请您仔细阅读本协议，您点击"同意并继续"即表示接受本协议全部条款。

二、注册条件
1. 您必须年满18周岁，具有完全民事行为能力。
2. 您需提供真实、准确的个人信息进行注册。
3. 一人仅可注册一个账户，不得以他人名义注册。

三、用户权利与义务
1. 您有权享受本平台提供的各项服务。
2. 您有义务保管好账户密码，不得转让或借用。
3. 您不得利用本平台从事任何违法违规活动。
4. 您应遵守本平台的各项规则和规范。

四、隐私保护
本平台重视您的隐私保护，将依法收集、使用和保护您的个人信息，详见《隐私政策》。

五、协议变更
本平台有权根据需要修改本协议，修改后将在平台公告，请您定期查阅。

六、法律适用
本协议的签订、解释及纠纷解决均适用中华人民共和国法律。`;

const CONTRACT_AGREEMENT = `众泰商城寄卖服务协议

一、协议说明
本协议是您与众泰商城平台就寄卖服务所订立的正式合同，具有法律约束力。请认真阅读并确认签署。

二、服务内容
1. 本平台为您提供商品寄卖、竞拍及分销等电商服务。
2. 平台将对您提交的商品进行审核，符合条件方可上架销售。
3. 商品成交后，平台将按约定比例收取服务费用。

三、费用标准
1. 寄卖服务费：成交金额的3%。
2. 仓储管理费：按实际存储时间和商品类别计算。
3. 具体收费标准以平台公示为准。

四、结算规则
1. 商品成交确认后，平台将在3个工作日内完成结算。
2. 结算金额将打入您的平台账户，可申请提现。
3. 提现手续费按实际金额的0.5%收取，最低1元。

五、违约责任
1. 若您提供虚假信息，平台有权立即终止服务并追究法律责任。
2. 若您违反平台规则，平台有权扣除相应保证金。

六、协议期限
本协议自签署之日起生效，长期有效，双方均可提前30天书面通知对方终止。`;

// ─── 身份证格式验证 ─────────────────────────────────────────────
function validateIdCard(id: string): boolean {
  return /^\d{17}[\dXx]$/.test(id);
}

export default function MRegisterPage() {
  const { register, mobileUser, refreshUser } = useMobileUser();
  const navigate = useNavigate();

  // ── 当前步骤（0 = 填写账号信息，1~5 为注册流程步骤）──
  const [phase, setPhase] = useState<'account' | 'flow'>('account');
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  // ── 账号信息 ──
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── 步骤1 - 注册协议 ──
  const [agreementRead, setAgreementRead] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  // ── 步骤2 - 实名认证 ──
  const [realName, setRealName] = useState('');
  const [idCardNo, setIdCardNo] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  // 身份证图片上传
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const idFrontRef = useRef<HTMLInputElement>(null);
  const idFrontAlbumRef = useRef<HTMLInputElement>(null);
  const idBackRef = useRef<HTMLInputElement>(null);
  const idBackAlbumRef = useRef<HTMLInputElement>(null);

  // ── 步骤3 - 签约协议 ──
  const [contractRead, setContractRead] = useState(false);
  const [contractChecked, setContractChecked] = useState(false);

  // ── 步骤4 - 手写签名 ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasSigned, setHasSigned] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw');

  // ── 步骤5 - 收货地址 ──
  const [addrForm, setAddrForm] = useState({
    receiver_name: '', phone: '', province: '', city: '', district: '', detail: '',
  });
  const [addrLoading, setAddrLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // 从 URL 读取邀请码
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) setInviteCode(code);
  }, []);

  // ─── 步骤0: 注册账号 ────────────────────────────────────────
  const handleRegister = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入正确的手机号'); return; }
    const pwdErr = validateUserPassword(password);
    if (pwdErr) { toast.error(pwdErr); return; }
    if (password !== confirmPassword) { toast.error('两次输入的密码不一致'); return; }
    if (!inviteCode.trim()) { toast.error('请输入推荐码，注册须凭推荐码加入'); return; }
    // 校验推荐码是否存在
    const { data: referrerRow } = await supabase.from('users').select('id').eq('invite_code', inviteCode.trim().toUpperCase()).maybeSingle();
    if (!referrerRow) { toast.error('推荐码无效，请确认后重新输入'); return; }
    setRegLoading(true);
    const { error } = await register(phone, password, inviteCode || undefined);
    setRegLoading(false);
    if (error) { toast.error(error); return; }
    // 注册成功后进入5步流程
    const { data: u } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle();
    if (u) setUserId(u.id);
    setPhase('flow');
    setStep(1);
  };

  // ─── 步骤1: 同意注册协议 ────────────────────────────────────
  const handleAgreementNext = () => {
    if (!agreementChecked) { toast.error('请先阅读并勾选同意协议'); return; }
    setStep(2);
  };

  // ─── 步骤2: 实名认证 ────────────────────────────────────────
  /** 文件 → Base64（分块，避免大图 stack overflow） */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // data:image/xxx;base64,<data>  →  只取 data 部分
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** 选择身份证图片后：正面自动 OCR 识别姓名 + 身份证号 */
  const handleIdImgSelect = async (side: 'front' | 'back', file: File) => {
    const preview = URL.createObjectURL(file);
    if (side === 'front') {
      setIdFrontFile(file);
      setIdFrontPreview(preview);
      setOcrDone(false);
      setOcrLoading(true);
      try {
        const imageBase64 = await fileToBase64(file);
        const { data, error } = await supabase.functions.invoke('id-card-ocr', {
          body: { id_card_side: 'front', image: imageBase64 },
        });
        if (error) throw error;
        // 自托管未配置 OCR 服务：静默跳过自动填充
        if (data?.reason === 'ocr_not_configured') {
          setOcrDone(false);
          return;
        }
        // 百度身份证 OCR 返回 words_result 对象（key=字段名）
        const wr = data?.words_result ?? {};
        const name = wr['姓名']?.words ?? '';
        const cardNo = wr['公民身份号码']?.words ?? '';
        if (name)   setRealName(name);
        if (cardNo) setIdCardNo(cardNo.toUpperCase());
        if (name || cardNo) {
          toast.success('OCR识别成功，请核对信息');
          setOcrDone(true);
        } else {
          toast.warning('未能识别信息，请手动填写或重新拍摄');
        }
      } catch {
        toast.warning('OCR识别失败，请手动填写姓名和身份证号');
      } finally {
        setOcrLoading(false);
      }
    } else {
      setIdBackFile(file);
      setIdBackPreview(preview);
    }
  };

  /** 压缩图片到 < 1 MB，转为 webp */
  const compressImage = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        const MAX = 1080;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round((h / w) * MAX); w = MAX; }
          else { w = Math.round((w / h) * MAX); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        let q = 0.8;
        const tryExport = () => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('压缩失败')); return; }
            if (blob.size > 1048576 && q > 0.3) { q -= 0.1; tryExport(); return; }
            resolve(blob);
          }, 'image/webp', q);
        };
        tryExport();
        URL.revokeObjectURL(url);
      };
      img.onerror = reject;
      img.src = url;
    });

  /** 提交认证：二要素核验 + 上传图片 + 写库，一步完成 */
  const handleKyc = async () => {
    const name = realName.trim();
    // 清理身份证号中可能的空格/换行（OCR识别结果可能含空格）
    const card = idCardNo.replace(/\s/g, '').trim().toUpperCase();
    if (!idFrontFile) { toast.error('请先上传身份证正面照片'); return; }
    if (!name) { toast.error('请填写或确认真实姓名'); return; }
    if (!validateIdCard(card)) { toast.error('请填写正确的身份证号码（17位数字+1位数字或X）'); return; }
    setKycLoading(true);
    try {
      const uid = userId || mobileUser?.id;
      // 1. 身份证查重
      const { data: isTaken, error: checkErr } = await supabase.rpc('check_id_card_taken', {
        p_id_card_no: card,
        p_user_id: uid ?? '00000000-0000-0000-0000-000000000000',
      });
      if (checkErr) throw new Error('查重校验失败，请重试');
      if (isTaken) {
        toast.error('该身份证号已被其他账号绑定，每个身份证只能实名认证一次');
        return;
      }
      // 2. 二要素核验（自托管未配置时静默跳过）
      const { data, error } = await supabase.functions.invoke('id-card-two-factor-auth', {
        body: { idcard: card, name },
      });
      if (error) throw new Error('认证服务连接失败，请重试');
      // 自托管未配置外部二要素核验：跳过，不阻断注册流程
      if (data?.reason === 'ocr_not_configured') {
        toast.info('二要素自动核验未配置，已跳过');
      } else {
        const respBody = data?.showapi_res_body;
        if (data?.showapi_res_code !== 0) throw new Error(data?.showapi_res_error || '认证服务异常');
        if (respBody?.code !== 0) {
          const msgs: Record<number, string> = {
            1: '姓名与身份证号不匹配，请核实后重新输入',
            2: '该身份证号不存在，请检查输入',
            12: '身份证号格式不正确',
            14: '姓名格式异常，请检查',
            100: '认证服务繁忙，请稍后重试',
            101: '操作过于频繁，请60秒后再试',
            103: '今日核验次数已达上限，请明日再试',
          };
          throw new Error(msgs[respBody.code] || `认证失败（code=${respBody.code}）`);
        }
      }
      // 3. 先写库（认证通过即生效，图片上传失败不阻断流程）
      if (uid) {
        await supabase.from('users').update({
          real_name: name,
          id_card_no: card,
          kyc_status: 'approved',
        }).eq('id', uid);
      }
      // 4. 后台尝试上传身份证图片（失败仅给提示，不影响认证结果）
      const uploadOne = async (file: File, side: 'front' | 'back') => {
        let blob: Blob = file;
        if (file.size > 1048576) blob = await compressImage(file);
        const path = `${uid}/${side}-${Date.now()}.webp`;
        const { error: upErr } = await supabase.storage
          .from('id-card-images').upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (upErr) throw upErr;
        return supabase.storage.from('id-card-images').getPublicUrl(path).data.publicUrl;
      };
      try {
        const frontUrl = await uploadOne(idFrontFile, 'front');
        const backUrl  = idBackFile ? await uploadOne(idBackFile, 'back') : null;
        if (uid) {
          await supabase.from('users').update({
            id_card_front_url: frontUrl,
            ...(backUrl ? { id_card_back_url: backUrl } : {}),
          }).eq('id', uid);
        }
      } catch {
        // 图片上传失败不阻断认证，后续可补传
        console.warn('身份证图片上传失败，认证已通过但图片未保存');
      }
      toast.success('实名认证通过！');
      setTimeout(() => setStep(3), 800);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '认证失败，请重试');
    } finally {
      setKycLoading(false);
    }
  };

  // ─── 步骤3: 确认签约协议 ────────────────────────────────────
  const handleContractNext = () => {
    if (!contractChecked) { toast.error('请先阅读并勾选同意签约协议'); return; }
    setStep(4);
  };

  // ─── 步骤4: 手写签名 Canvas ──────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSigned(true);
  }, []);

  const endDraw = () => { isDrawing.current = false; lastPos.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleSignNext = async () => {
    if (!hasSigned) { toast.error('请先完成手写签名'); return; }
    const signData = canvasRef.current?.toDataURL('image/png') ?? '';
    const uid = userId || mobileUser?.id;
    if (uid && signData) {
      await supabase.from('users').update({ signature_data: signData, register_step: 4 }).eq('id', uid);
    }
    setStep(5);
  };

  // ─── 步骤5: 提交收货地址 ────────────────────────────────────
  const handleAddressSubmit = async () => {
    if (!addrForm.receiver_name.trim()) { toast.error('请填写收货人姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(addrForm.phone)) { toast.error('请输入正确的联系手机号'); return; }
    if (!addrForm.province.trim() || !addrForm.city.trim()) { toast.error('请填写省市信息'); return; }
    if (!addrForm.detail.trim()) { toast.error('请填写详细地址'); return; }
    setAddrLoading(true);
    const uid = userId || mobileUser?.id;
    try {
      await supabase.from('user_addresses').insert({
        user_id: uid,
        ...addrForm,
        is_default: true,
      });
      if (uid) await supabase.from('users').update({ register_step: 5 }).eq('id', uid);
      await refreshUser();
      toast.success('注册完成，欢迎加入众泰商城！');
      navigate('/m/home');
    } catch {
      toast.error('地址保存失败，请重试');
    } finally {
      setAddrLoading(false);
    }
  };

  // ─── 进度步骤条 ─────────────────────────────────────────────
  const StepBar = () => (
    <div className="px-4 py-3 bg-card border-b border-border">
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? 'bg-primary text-primary-foreground'
                  : active ? 'bg-primary/15 text-primary border-2 border-primary'
                  : 'bg-muted text-muted-foreground'
                }`}>
                  {done ? <CheckCircle2 size={14} /> : s.id}
                </div>
                <span className={`text-[10px] text-center leading-tight ${active ? 'text-primary font-medium' : done ? 'text-primary/70' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mb-4 mx-0.5 transition-all ${step > s.id ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  // ─── 协议阅读区块 ────────────────────────────────────────────
  const AgreementBlock = ({
    content, title, read, onRead, checked, onChecked, checkLabel, checkboxId,
  }: {
    content: string; title: string; read: boolean; checkboxId: string;
    onRead: () => void; checked: boolean; onChecked: (v: boolean) => void; checkLabel: string;
  }) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-primary shrink-0" />
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        请向下滑动阅读全部内容后，方可勾选同意
      </div>
      {/* 用普通 div 替代 Radix ScrollArea，onScroll 可直接绑定 */}
      <div
        className="flex-1 bg-muted/30 rounded-xl border border-border p-4 overflow-y-auto max-h-[50vh] relative"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) onRead();
        }}
      >
        <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed font-sans">{content}</pre>
        {!read && (
          <div className="sticky bottom-0 left-0 right-0 text-center text-[10px] text-muted-foreground/80 py-1.5 bg-gradient-to-t from-muted/60 to-transparent pointer-events-none">
            ↓ 继续向下滚动以阅读全部内容
          </div>
        )}
      </div>
      <div className="mt-4 flex items-start gap-2">
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={v => onChecked(!!v)}
          disabled={!read}
          className="mt-0.5"
        />
        <label htmlFor={checkboxId} className={`text-sm leading-snug cursor-pointer ${read ? 'text-foreground' : 'text-muted-foreground'}`}>
          {checkLabel}
        </label>
      </div>
      {!read && (
        <p className="text-[11px] text-amber-600 mt-1.5">请先完整阅读协议内容再勾选同意</p>
      )}
    </div>
  );

  // ─── 渲染 ────────────────────────────────────────────────────
  if (phase === 'account') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <MobileHeader title="注册账号" back />
        <div className="flex-1 px-6 pt-8 pb-8 overflow-y-auto">
          <div className="space-y-4">
            {/* 手机号 */}
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">手机号</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input type="tel" placeholder="请输入手机号" className="pl-9 h-12 text-base"
                  value={phone} onChange={e => setPhone(e.target.value)} maxLength={11} />
              </div>
            </div>
            {/* 登录密码 */}
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">登录密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input type={showPwd ? 'text' : 'password'} placeholder="请设置登录密码（不少于6位）"
                  className="pl-9 pr-10 h-12 text-base" value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {/* 确认密码 */}
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">确认密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input type={showConfirm ? 'text' : 'password'} placeholder="请再次输入密码"
                  className={`pl-9 pr-10 h-12 text-base ${confirmPassword && confirmPassword !== password ? 'border-destructive' : ''}`}
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && <p className="text-xs text-destructive mt-1">两次密码不一致</p>}
            </div>
            {/* 推荐码 */}
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">推荐码 <span className="text-destructive">*</span></label>
              <div className="relative">
                <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="请输入推荐码（必填）" className="pl-9 h-12 text-base"
                  value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} maxLength={12} />
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
              须凭推荐码方可加入，推荐码绑定后不可更改
            </div>
            <Button className="w-full h-12 text-base font-medium" onClick={handleRegister} disabled={regLoading}>
              {regLoading ? <><Loader2 size={16} className="animate-spin mr-2" />注册中...</> : '下一步：阅读注册协议'}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-sm">
            <span className="text-muted-foreground">已有账号？</span>
            <Link to="/m/login" className="text-primary font-medium">直接登录</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── 5步流程 ──
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MobileHeader
        title="完善注册信息"
        right={step > 1 ? (
          <button
            className="text-sm text-muted-foreground flex items-center gap-0.5 px-1"
            onClick={() => setStep(s => s - 1)}
          >
            ← 上一步
          </button>
        ) : undefined}
      />
      <StepBar />

      <div className="flex-1 px-4 py-5 overflow-y-auto flex flex-col">

        {/* ── STEP 1: 注册协议 ── */}
        {step === 1 && (
          <div className="flex flex-col flex-1 gap-4">
            <AgreementBlock
              title="用户注册协议"
              content={REGISTER_AGREEMENT}
              read={agreementRead}
              onRead={() => setAgreementRead(true)}
              checked={agreementChecked}
              onChecked={setAgreementChecked}
              checkboxId="agree-register"
              checkLabel="我已仔细阅读并同意《众泰商城用户注册协议》的全部内容"
            />
            <Button className="w-full h-12 text-base" onClick={handleAgreementNext} disabled={!agreementChecked}>
              同意并继续 <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 2: 实名认证（上传身份证 → OCR自动识别 → 提交） ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center mb-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck size={28} className="text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground">实名身份认证</h2>
              <p className="text-xs text-muted-foreground mt-1">为保障交易安全，请完成真实身份核验</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
              <p className="font-semibold mb-1">操作说明</p>
              <p>• 上传身份证正面后，系统将自动识别姓名和证件号</p>
              <p>• 请核对识别结果，如有偏差可手动修正</p>
              <p>• 实名信息经过加密保存，不会对外泄露</p>
            </div>

            {/* 身份证正面上传 + OCR */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <IdCard size={15} className="text-primary" />
                身份证正面（头像面）<span className="text-destructive text-xs">*必填</span>
              </label>
              {/* 拍照 input */}
              <input ref={idFrontRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIdImgSelect('front', f); e.target.value = ''; }} />
              {/* 相册 input */}
              <input ref={idFrontAlbumRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIdImgSelect('front', f); e.target.value = ''; }} />
              {idFrontPreview ? (
                <div className="relative rounded-xl overflow-hidden border-2 border-primary/40">
                  <img src={idFrontPreview} alt="身份证正面" className="w-full h-40 object-cover" />
                  {ocrLoading && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                      <Loader2 size={24} className="animate-spin text-white" />
                      <span className="text-white text-xs">正在识别信息…</span>
                    </div>
                  )}
                  {ocrDone && !ocrLoading && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={11} />识别完成
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button type="button" disabled={ocrLoading} onClick={() => idFrontRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:bg-primary/80 transition-colors disabled:opacity-50">
                      <Camera size={13} />重拍
                    </button>
                    <button type="button" disabled={ocrLoading} onClick={() => idFrontAlbumRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium active:bg-primary/30 transition-colors disabled:opacity-50">
                      <ImagePlus size={13} />相册
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1.5 bg-muted/30 mb-2">
                    <Camera size={26} className="text-primary/50" />
                    <span className="text-sm text-muted-foreground">请拍照或从相册选取正面</span>
                    <span className="text-xs text-muted-foreground/70">上传后自动识别信息</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => idFrontRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:bg-primary/80 transition-colors">
                      <Camera size={13} />拍照
                    </button>
                    <button type="button" onClick={() => idFrontAlbumRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium active:bg-primary/30 transition-colors">
                      <ImagePlus size={13} />从相册选择
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 身份证背面（紧接正面） */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <IdCard size={15} className="text-muted-foreground" />
                身份证背面（国徽面）<span className="text-muted-foreground text-xs ml-1">可选</span>
              </label>
              {/* 拍照 input */}
              <input ref={idBackRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIdImgSelect('back', f); e.target.value = ''; }} />
              {/* 相册 input */}
              <input ref={idBackAlbumRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIdImgSelect('back', f); e.target.value = ''; }} />
              {idBackPreview ? (
                <div className="relative rounded-xl overflow-hidden border-2 border-border/60">
                  <img src={idBackPreview} alt="身份证背面" className="w-full h-32 object-cover" />
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button type="button" onClick={() => idBackRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:bg-primary/80 transition-colors">
                      <Camera size={13} />重拍
                    </button>
                    <button type="button" onClick={() => idBackAlbumRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium active:bg-primary/30 transition-colors">
                      <ImagePlus size={13} />相册
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="w-full h-28 border-2 border-dashed border-border/50 rounded-xl flex flex-col items-center justify-center gap-1.5 bg-muted/20 mb-2">
                    <Camera size={22} className="text-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground/70">拍照或从相册选取背面</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => idBackRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:bg-primary/80 transition-colors">
                      <Camera size={13} />拍照
                    </button>
                    <button type="button" onClick={() => idBackAlbumRef.current?.click()}
                      className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium active:bg-primary/30 transition-colors">
                      <ImagePlus size={13} />从相册选择
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* OCR 识别结果填充区（在两张图片下方） */}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  真实姓名
                  {ocrDone && <span className="text-green-600 text-xs ml-2">（已自动识别，可修改）</span>}
                </label>
                <Input placeholder={ocrLoading ? '识别中…' : '请输入身份证上的真实姓名'}
                  className="h-12 text-base" value={realName}
                  onChange={e => setRealName(e.target.value)}
                  disabled={ocrLoading} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  身份证号码
                  {ocrDone && <span className="text-green-600 text-xs ml-2">（已自动识别，可修改）</span>}
                </label>
                <Input placeholder={ocrLoading ? '识别中…' : '请输入18位身份证号码'}
                  className="h-12 text-base tracking-wider" value={idCardNo}
                  onChange={e => setIdCardNo(e.target.value.replace(/\s/g, '').toUpperCase())}
                  maxLength={18} disabled={ocrLoading} />
                {idCardNo && !validateIdCard(idCardNo.replace(/\s/g, '')) && (
                  <p className="text-xs text-destructive mt-1">身份证号格式不正确（17位数字+1位数字或X）</p>
                )}
              </div>
            </div>

            <Button className="w-full h-12 text-base" onClick={handleKyc}
              disabled={kycLoading || ocrLoading || !idFrontFile || !realName.trim() || !validateIdCard(idCardNo.toUpperCase())}>
              {kycLoading
                ? <><Loader2 size={16} className="animate-spin mr-2" />认证提交中…</>
                : <><ShieldCheck size={16} className="mr-2" />提交实名认证</>}
            </Button>
          </div>
        )}

        {/* ── STEP 3: 签约协议 ── */}
        {step === 3 && (
          <div className="flex flex-col flex-1 gap-4">
            <AgreementBlock
              title="寄卖服务签约协议"
              content={CONTRACT_AGREEMENT}
              read={contractRead}
              onRead={() => setContractRead(true)}
              checked={contractChecked}
              onChecked={setContractChecked}
              checkboxId="agree-contract"
              checkLabel="我已仔细阅读并同意《众泰商城寄卖服务签约协议》，本协议对我具有法律约束力"
            />
            <Button className="w-full h-12 text-base" onClick={handleContractNext} disabled={!contractChecked}>
              确认签约并继续 <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 4: 手写签名 ── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <PenLine size={24} className="text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground">手写签名确认</h2>
              <p className="text-xs text-muted-foreground mt-1">请在下方区域手写您的签名，以确认您已同意上述协议</p>
            </div>

            <div className="space-y-2">
              <div className="relative bg-white border-2 border-dashed border-border rounded-2xl overflow-hidden"
                style={{ touchAction: 'none' }}>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={220}
                  className="w-full block cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                {!hasSigned && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-muted-foreground/50 text-sm">请在此处手写签名</p>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={clearCanvas}>
                清除重写
              </Button>
            </div>

            <div className="bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground">
              <p>• 您的签名将作为电子协议的法律依据</p>
              <p>• 请确保签名为您本人亲笔</p>
            </div>

            <Button className="w-full h-12 text-base" onClick={handleSignNext} disabled={!hasSigned}>
              确认签名，下一步 <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 5: 收货地址 ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="text-center mb-1">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <MapPin size={24} className="text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground">填写收货地址</h2>
              <p className="text-xs text-muted-foreground mt-1">请填写您的真实收货地址，方便后续商品寄送</p>
            </div>

            <div className="space-y-3">
              {[
                { label: '收货人姓名', key: 'receiver_name', placeholder: '请输入收货人真实姓名', type: 'text' },
                { label: '联系手机号', key: 'phone', placeholder: '请输入11位手机号码', type: 'tel' },
                { label: '省份', key: 'province', placeholder: '如：广东省', type: 'text' },
                { label: '城市', key: 'city', placeholder: '如：深圳市', type: 'text' },
                { label: '区/县', key: 'district', placeholder: '如：南山区（选填）', type: 'text' },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="text-sm text-muted-foreground mb-1.5 block">{label}</label>
                  <Input
                    type={type}
                    placeholder={placeholder}
                    className="h-11 text-base"
                    value={addrForm[key as keyof typeof addrForm]}
                    onChange={e => setAddrForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">详细地址</label>
                <textarea
                  placeholder="请输入街道、门牌号、楼层等详细信息"
                  className="w-full min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={addrForm.detail}
                  onChange={e => setAddrForm(f => ({ ...f, detail: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <p>恭喜！您已完成注册流程的最后一步。提交地址后即可开始使用众泰商城的全部功能。</p>
            </div>

            <Button className="w-full h-12 text-base font-semibold" onClick={handleAddressSubmit} disabled={addrLoading}>
              {addrLoading ? <><Loader2 size={16} className="animate-spin mr-2" />提交中...</> : '完成注册 '}
            </Button>

            <button
              className="w-full text-center text-sm text-muted-foreground py-2"
              onClick={() => { navigate('/m/home'); toast.info('地址可在「我的」→「收货地址」中补充'); }}
            >
              暂不填写，先去逛逛 <span className="text-primary">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

