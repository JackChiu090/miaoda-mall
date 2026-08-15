import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import QRCodeDataUrl from '@/components/ui/qrcodedataurl';
import { Copy, Share2 } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

export default function MInvitePage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);

  if (!mobileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Button onClick={() => navigate('/m/login')}>请先登录</Button>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/m/register?code=${mobileUser.invite_code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => toast.success('邀请链接已复制'));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(mobileUser.invite_code).then(() => toast.success('邀请码已复制'));
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="邀请好友" back />
      <div className="px-4 py-6 space-y-4">
        {/* 邀请海报 */}
        <div ref={posterRef} className="bg-gradient-to-b from-primary/20 to-card border border-border rounded-2xl overflow-hidden">
          {/* 海报头部 */}
          <div className="bg-primary px-6 py-8 text-center">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-xl">{"X"}</span>
            </div>
            <h2 className="text-white text-xl font-bold">{"众泰成商城"}</h2>
            <p className="text-white/80 text-sm mt-1">私域寄卖 · 限时竞拍 · 裂变分销</p>
          </div>

          {/* 邀请信息 */}
          <div className="px-6 py-6 text-center space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">{mobileUser.nickname} 邀请您加入 X商城</p>
              <p className="text-foreground text-sm mt-1">扫码注册，锁定邀请关系，共享团队收益</p>
            </div>

            {/* 二维码 */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeDataUrl text={inviteUrl} width={140} />
              </div>
            </div>

            {/* 邀请码 */}
            <div className="bg-muted/40 rounded-xl py-3 px-4">
              <p className="text-xs text-muted-foreground">专属邀请码</p>
              <p className="text-2xl font-bold text-primary tracking-widest mt-1">{mobileUser.invite_code}</p>
            </div>
          </div>
        </div>

        {/* 分享说明 */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">邀请说明</h3>
          <ul className="space-y-1">
            {[
              '新用户通过邀请码注册后，永久绑定推荐关系',
              '下级完成每笔交易，您可获得对应分润奖励',
            ].map((tip, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary shrink-0 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-11" onClick={copyCode}>
            <Copy size={15} className="mr-2" />
            复制邀请码
          </Button>
          <Button className="h-11" onClick={copyLink}>
            <Share2 size={15} className="mr-2" />
            复制邀请链接
          </Button>
        </div>
      </div>
    </div>
  );
}
