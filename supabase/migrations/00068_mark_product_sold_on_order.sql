-- 00068: 订单创建时自动将对应寄卖商品标记为已售（保证寄卖数量与进货数量匹配）
-- 规则：有商家从老板处进货后，对应减少老板寄卖商品数量（is_active=false）

CREATE OR REPLACE FUNCTION public.mark_product_sold_on_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET is_active = false
    WHERE id = NEW.product_id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_product_sold ON public.orders;
CREATE TRIGGER trg_mark_product_sold
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.mark_product_sold_on_order();

-- 订单取消时恢复商品上架（is_active=true），保证数量守恒
CREATE OR REPLACE FUNCTION public.restore_product_on_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET is_active = true
    WHERE id = NEW.product_id
      AND is_active = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_product_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_product_on_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_product_on_cancel();
