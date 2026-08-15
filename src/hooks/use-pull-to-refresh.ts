import { useEffect, useRef, useState } from 'react';

/**
 * 移动端下拉刷新 hook
 * - 页面在顶部时向下拖动超过阈值，触发 onRefresh 回调
 * - 返回 { pullDistance, isPulling, isRefreshing }
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  options: { threshold?: number; containerRef?: React.RefObject<HTMLElement> } = {}
) {
  const { threshold = 64 } = options;
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    const el = options.containerRef?.current ?? document.documentElement;

    const onTouchStart = (e: TouchEvent) => {
      // 只在顶部才触发
      const scrollTop = (options.containerRef?.current ?? document.scrollingElement ?? document.documentElement).scrollTop;
      if (scrollTop > 4) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { pulling.current = false; setPullDistance(0); setIsPulling(false); return; }
      // 阻尼效果
      const dist = Math.min(dy * 0.45, threshold * 1.5);
      setPullDistance(dist);
      setIsPulling(true);
      if (dist >= threshold * 0.45) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullDistance >= threshold * 0.7 && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(40);
        setIsPulling(false);
        try { await onRefresh(); } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, threshold, isRefreshing, pullDistance, options.containerRef]);

  return { pullDistance, isPulling, isRefreshing };
}
