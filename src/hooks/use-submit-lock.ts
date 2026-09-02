import { useCallback, useRef, useState } from 'react';

/**
 * 全局防重复提交锁（业务提交/数据变更按钮统一使用）
 *
 * 背景：仅靠 `disabled={submitting}` 无法拦截快速连点——
 * React 状态更新是异步的，双击时第二次 click 发生时状态尚未刷新，按钮仍可点击；
 * 且进货类按钮的加锁若放在 await 校验之后，校验期间的连点会全部穿透。
 * 因此用 useRef 同步锁在「点击瞬间」即加锁，从源头拦截后续重复请求。
 *
 * 用法：
 *   const { tryLock, unlock, isPending } = useSubmitLock();
 *   async function handleSubmit() {
 *     if (!tryLock('submit')) return;      // 已锁则静默忽略本次点击
 *     try { ...await 提交... }
 *     finally { unlock('submit'); }        // 成功/失败均解锁
 *   }
 *   <Button disabled={isPending('submit')} onClick={handleSubmit}>提交</Button>
 *
 * 多商品/多订单场景以商品 id、订单 id 作为 key 隔离互不影响。
 */
export function useSubmitLock() {
  const locksRef = useRef<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  /** 尝试加锁；已锁返回 false，调用方应直接 return（静默忽略连点） */
  const tryLock = useCallback((key: string): boolean => {
    if (locksRef.current.has(key)) return false;
    locksRef.current.add(key);
    setPendingKeys(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    return true;
  }, []);

  /** 解锁（提交成功或失败都必须调用，避免按钮永久置灰） */
  const unlock = useCallback((key: string) => {
    locksRef.current.delete(key);
    setPendingKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /** 某 key 是否处于提交中（驱动按钮 disabled / loading 视觉） */
  const isPending = useCallback((key: string) => pendingKeys.has(key), [pendingKeys]);

  return { tryLock, unlock, isPending };
}
