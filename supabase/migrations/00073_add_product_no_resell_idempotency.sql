-- ============================================================
-- 「转拍上架」幂等性：以「商品编号」(product_no) 作为唯一校验键
--
-- 需求：同一商品在单次上架流程中，无论前端触发多少次请求，
--       仅执行一次「买单仓库 → 寄卖仓库」的库存变更，杜绝重复上架。
--
-- 商品编号规则：
--   - 普通转拍（未拆单）：product_no = 来源订单号 order_no
--   - 拆单转拍：product_no = order_no + '-A' / order_no + '-B'
--   - 非转拍商品：product_no = NULL（唯一索引允许多个 NULL，不受影响）
--
-- 实施：
--   1. products 增加 product_no 列
--   2. 建立唯一索引（数据库层幂等兜底，重复插入直接报唯一冲突）
--   3. 回填历史转拍商品编号（同一订单的重复商品按创建时间追加 -DUP 后缀，避免唯一冲突）
-- ============================================================

-- 1. 商品编号列
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_no text;

COMMENT ON COLUMN products.product_no IS
  '商品编号：转拍上架幂等唯一校验键。普通转拍=来源订单号，拆单=来源订单号-A/-B，非转拍商品为 NULL';

-- 2. 唯一索引（PostgreSQL 唯一索引允许多个 NULL，非转拍商品 product_no 为 NULL 不受影响）
CREATE UNIQUE INDEX IF NOT EXISTS products_product_no_key ON products (product_no);

-- 3. 回填历史转拍商品编号
--    同一订单的重复商品（历史 bug 产物）按创建时间排序追加 -DUP 后缀，
--    既保证唯一索引不冲突，又便于后续清理任务按后缀定位重复项。
WITH ranked AS (
  SELECT
    p.id,
    o.order_no,
    CASE
      WHEN p.title LIKE '%（拆单A）%' THEN '-A'
      WHEN p.title LIKE '%（拆单B）%' THEN '-B'
      ELSE ''
    END AS suffix,
    row_number() OVER (
      PARTITION BY p.origin_order_id,
                   (p.title LIKE '%（拆单A）%'),
                   (p.title LIKE '%（拆单B）%')
      ORDER BY p.created_at, p.id
    ) AS rn
  FROM products p
  JOIN orders o ON o.id = p.origin_order_id
  WHERE p.is_resell = true
    AND p.product_no IS NULL
)
UPDATE products p
SET product_no = r.order_no || r.suffix ||
                 CASE WHEN r.rn > 1 THEN '-DUP' || r.rn ELSE '' END
FROM ranked r
WHERE p.id = r.id;
