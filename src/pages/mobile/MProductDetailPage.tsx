import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Tag, User, Zap } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

interface Product {
  id: string;
  title: string;
  description: string | null;
  consignment_price: number;
  images: string[];
  generation: number;
  status: string;
  seller_id: string;
  product_categories: { name: string } | null;
  users: { real_name: string | null; nickname: string; phone: string; kyc_status: string } | null;
}

export default function MProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mobileUser } = useMobileUser();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('products')
      .select('id,title,description,consignment_price,images,generation,status,seller_id,product_categories(name),users!seller_id(real_name,nickname,phone,kyc_status)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => { setProduct(data as Product | null); setLoading(false); });
  }, [id]);

  const handleRush = () => {
    if (!mobileUser) { navigate('/m/login'); return; }
    navigate('/m/rush');
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="" back />
      <Skeleton className="w-full aspect-square" />
      <div className="p-4 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20" /></div>
    </div>
  );

  if (!product) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">商品不存在</div>
  );

  const imgs = Array.isArray(product.images) && product.images.length > 0 ? product.images : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="商品详情" back />

      {/* 商品图 */}
      <div className="bg-card">
        <div className="aspect-square flex items-center justify-center overflow-hidden">
          {imgs.length > 0 ? (
            <img src={imgs[imgIdx]} alt={product.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package size={64} className="text-muted-foreground" />
            </div>
          )}
        </div>
        {imgs.length > 1 && (
          <div className="flex justify-center gap-1.5 py-2">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 价格 & 标题 */}
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-primary">¥1,688</span>
            <span className="text-xs text-muted-foreground">/套</span>
          </div>
          <h2 className="text-base font-semibold text-foreground mt-1">{product.title}</h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {product.product_categories?.name && (
              <Badge variant="outline" className="text-xs">
                <Tag size={10} className="mr-1" />{product.product_categories.name}
              </Badge>
            )}
            {product.generation > 1 && (
              <Badge variant="secondary" className="text-xs">第{product.generation}代 +{((product.generation - 1) * 3).toFixed(0)}%溢价</Badge>
            )}
          </div>
        </div>

        {/* 卖家信息 */}
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <User size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">寄卖人</p>
            <p className="text-sm text-foreground">{product.users?.kyc_status === 'approved' && product.users?.real_name ? product.users.real_name : (product.users?.nickname ?? '匿名用户')}</p>
          </div>
        </div>

        {/* 商品描述 */}
        {product.description && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">商品介绍</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* 交易说明 */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">交易说明</h3>
          {[
            '本平台采用C2C私域撮合交易，买卖双方私域直转',
            '平台收取成交金额3%服务费',
            '抢单成功后须在规定时间内完成付款并上传凭证',
          ].map((tip, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary shrink-0 mt-0.5">•</span>{tip}
            </p>
          ))}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-3">
        <Button className="w-full h-12 text-base font-medium" onClick={handleRush}>
          <Zap size={16} className="mr-2" />
          参与限时抢单
        </Button>
      </div>
    </div>
  );
}
