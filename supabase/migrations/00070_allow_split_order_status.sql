-- 00070: orders.status 允许 'split'（拆单标记）状态
-- 拆单后原订单需要标记为 split，但原 CHECK 约束未包含该值，导致标记失败

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'pending_payment', 'payment_uploaded', 'confirmed', 'completed',
    'cancelled', 'disputed', 'resell_listed', 'split'
  ])
);
