-- 00071: 拆单阈值默认值调整为 20000，并更新描述
-- 规则：转拍商品价格 >= 阈值时，自动平均拆分为 2 单（两个半价商品）

UPDATE public.system_configs
SET config_value = '20000',
    description  = '转拍商品价格达到此金额自动平均拆分为两单',
    updated_at   = now()
WHERE config_key = 'order_split_threshold';

-- 若配置行不存在（新装/异常），补充插入默认值
INSERT INTO public.system_configs (config_key, config_value, value_type, label, description, group_name, sort_order)
SELECT 'order_split_threshold', '20000', 'number', '拆单溢价阈值（元）', '转拍商品价格达到此金额自动平均拆分为两单', 'order_split', 10
WHERE NOT EXISTS (SELECT 1 FROM public.system_configs WHERE config_key = 'order_split_threshold');
