ALTER TABLE public.morning_incentive_config
  ADD COLUMN regular_first_order_limit integer NOT NULL DEFAULT 2,
  ADD COLUMN trial_first_order_limit integer NOT NULL DEFAULT 1;
ALTER TABLE public.morning_incentive_config DROP COLUMN first_order_limit;