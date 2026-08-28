-- ============================================================
-- 下线「吃土筛选」功能
-- 1. 删除 system_configs 中 screening 分组的配置项（吃土筛选开关等）
-- 2. 删除 system_settings 中 eat_soil 系列参数
-- 注：daily_screenings / screening_records 表结构保留（无逻辑消费，空表无害）
-- ============================================================
DELETE FROM system_configs WHERE group_name = 'screening';
DELETE FROM system_settings WHERE key LIKE '%eat_soil%';
