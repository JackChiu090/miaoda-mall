import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Info } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

interface Category { id: string; name: string; }

const FIXED_PRICE = 1688;
const FEE_RATE = 0.03;export default function MConsignPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('product_categories').select('id,name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  if (!mobileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Button onClick={() => navigate('/m/login')}>请先登录</Button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('请填写商品名称'); return; }
    if (!categoryId) { toast.error('请选择商品分类'); return; }
    if (!mobileUser.is_super_admin && mobileUser.kyc_status !== 'approved') {
      toast.error('请先完成实名认证后再寄卖');
      navigate('/m/auth');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('products').insert({
      seller_id: mobileUser.id,
      category_id: categoryId,
      title: title.trim(),
      description: desc.trim(),
      original_price: FIXED_PRICE,
      consignment_price: FIXED_PRICE,
      consignment_fee: 0,
      storage_fee: 0,
      status: 'pending',
    });
    setLoading(false);
    if (error) {
      toast.error('提交失败，请重试');
    } else {
      toast.success('寄卖申请已提交，等待后台审核');
      navigate('/m/profile');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="商品寄卖" back />

      <div className="px-4 py-4 space-y-4">
        {/* 收益预览 */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Info size={12} />平台统一定价，提交后系统自动核算费用
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">商品定价</p>
              <p className="text-base font-bold text-foreground mt-0.5">平台统一定价</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">服务费 3%</p>
              <p className="text-base font-bold text-destructive mt-0.5">系统自动核算</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">实际收益</p>
              <p className="text-base font-bold text-primary mt-0.5">审核后到账</p>
            </div>
          </div>
        </div>

        {/* 图片上传 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <label className="text-sm font-semibold text-foreground block mb-3">商品图片</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 bg-muted/20 cursor-pointer hover:bg-muted/40">
              <Upload size={18} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">添加图片</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">演示模式：图片上传已简化</p>
        </div>

        {/* 商品信息 */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">商品名称 *</label>
            <Input placeholder="请输入商品名称（如：日化套装、美妆礼盒等）" className="h-11" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">商品分类 *</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="请选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">商品描述</label>
            <Textarea
              placeholder="请描述商品详情、品牌、规格等信息..."
              className="resize-none"
              rows={4}
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>

        {/* 须知 */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-1.5">
          {[
            '寄卖需先完成实名认证',
            '商品提交后须等待后台审核通过方可上架',
            '审核通过后商品进入进货池，由买方参与进货',
            '买方确认收款后，平台自动结算收益',
          ].map((t, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary shrink-0 mt-0.5">{i + 1}.</span>{t}
            </p>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-3">
        <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={loading}>
          {loading ? '提交中...' : '提交寄卖申请'}
        </Button>
      </div>
    </div>
  );
}
