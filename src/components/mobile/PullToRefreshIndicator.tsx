import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

/**
 * 下拉刷新顶部指示器
 * 根据 pullDistance 动态显示下拉进度和刷新动画
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 64,
}: PullToRefreshIndicatorProps) {
  const visible = pullDistance > 4 || isRefreshing;
  const progress = Math.min(pullDistance / (threshold * 0.7), 1);
  const ready = progress >= 1;

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{ height: isRefreshing ? 40 : pullDistance * 0.6 }}
    >
      <div className={`flex items-center gap-2 text-xs text-muted-foreground transition-all duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <RefreshCw
          size={14}
          className={`transition-transform duration-150 ${isRefreshing ? 'animate-spin text-primary' : ready ? 'text-primary rotate-180' : 'text-muted-foreground'}`}
          style={!isRefreshing ? { transform: `rotate(${progress * 180}deg)` } : undefined}
        />
        <span className={isRefreshing ? 'text-primary' : ready ? 'text-primary font-medium' : ''}>
          {isRefreshing ? '刷新中...' : ready ? '松开立即刷新' : '下拉刷新'}
        </span>
      </div>
    </div>
  );
}
