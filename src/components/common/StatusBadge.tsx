import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  // 通用
  pending: { label: '待处理', className: 'bg-warning/15 text-warning border-warning/30' },
  approved: { label: '已通过', className: 'bg-success/15 text-success border-success/30' },
  rejected: { label: '已拒绝', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  active: { label: '进行中', className: 'bg-accent/15 text-accent border-accent/30' },
  // 用户
  unsubmitted: { label: '未提交', className: 'bg-muted text-muted-foreground border-border' },
  normal: { label: '普通用户', className: 'bg-muted text-muted-foreground border-border' },
  member: { label: '会员', className: 'bg-accent/15 text-accent border-accent/30' },
  captain: { label: '团长', className: 'bg-primary/15 text-primary border-primary/30' },
  // 商品
  sold: { label: '已售出', className: 'bg-success/15 text-success border-success/30' },
  withdrawn: { label: '已下架', className: 'bg-muted text-muted-foreground border-border' },
  // 订单
  pending_payment: { label: '待付款', className: 'bg-warning/15 text-warning border-warning/30' },
  payment_uploaded: { label: '凭证已上传', className: 'bg-info/15 text-info border-info/30' },
  confirmed: { label: '已确认', className: 'bg-accent/15 text-accent border-accent/30' },
  completed: { label: '已完成', className: 'bg-success/15 text-success border-success/30' },
  cancelled: { label: '已取消', className: 'bg-muted text-muted-foreground border-border' },
  disputed: { label: '争议中', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  // 活动
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground border-border' },
  ended: { label: '已结束', className: 'bg-muted text-muted-foreground border-border' },
  // 提现
  paid: { label: '已打款', className: 'bg-success/15 text-success border-success/30' },
  // 优惠券
  unused: { label: '未使用', className: 'bg-accent/15 text-accent border-accent/30' },
  used: { label: '已使用', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: '已过期', className: 'bg-muted text-muted-foreground border-border' },
  // 公告
  published: { label: '已发布', className: 'bg-success/15 text-success border-success/30' },
  withdrawn_notice: { label: '已下架', className: 'bg-muted text-muted-foreground border-border' },
  // 结算
  settled: { label: '已结算', className: 'bg-success/15 text-success border-success/30' },
  failed: { label: '失败', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  // 管理员账号
  disabled: { label: '已禁用', className: 'bg-muted text-muted-foreground border-border' },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 text-xs border rounded-sm font-medium',
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}
