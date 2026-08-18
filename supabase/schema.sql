-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_cron"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_net"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: check_id_card_taken("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."check_id_card_taken"("p_id_card_no" "text", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id_card_no = p_id_card_no
      AND id <> p_user_id
      AND id_card_no IS NOT NULL
  );
$$;


--
-- Name: enforce_user_password_policy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."enforce_user_password_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password <> '123456' THEN
    RAISE EXCEPTION '非管理员用户密码只能设置为 123456';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_order_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."generate_order_no"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.order_no := 'ORD' || to_char(now(), 'YYYYMMDD') || lpad(floor(random()*1000000)::text, 6, '0');
  RETURN NEW;
END;
$$;


--
-- Name: get_server_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_server_time"() RETURNS timestamp with time zone
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT now();
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;


--
-- Name: mark_trial_merchants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."mark_trial_merchants"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 连续2次以上未进货 → 重置为体验商家
  UPDATE users
    SET merchant_type = 'trial', consecutive_missed = consecutive_missed + 1
  WHERE id IN (
    SELECT u.id FROM users u
    WHERE u.merchant_type = 'regular'
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.buyer_id = u.id
          AND o.created_at >= now() - interval '2 days'
          AND o.status NOT IN ('cancelled')
      )
  );
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: account_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."account_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(14,4) NOT NULL,
    "balance_after" numeric(14,4) NOT NULL,
    "related_order_id" "uuid",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_transactions_type_check" CHECK (("type" = ANY (ARRAY['in'::"text", 'out'::"text", 'freeze'::"text", 'unfreeze'::"text"])))
);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "activity_type" "text" DEFAULT 'flash_sale'::"text" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_from_time" time without time zone DEFAULT '09:00:00'::time without time zone,
    "is_test" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activities_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['flash_sale'::"text", 'auction'::"text"]))),
    CONSTRAINT "activities_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'ended'::"text", 'cancelled'::"text"])))
);


--
-- Name: activity_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."activity_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "activity_price" numeric(12,2) NOT NULL,
    "stock" integer DEFAULT 1 NOT NULL,
    "sold" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_operation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."admin_operation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_account" "text",
    "action_type" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "detail" "text",
    "ip" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."admin_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'customer_service'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'operator'::"text", 'customer_service'::"text"])))
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "text" DEFAULT 'notice'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "withdrawn_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'withdrawn'::"text"]))),
    CONSTRAINT "announcements_type_check" CHECK (("type" = ANY (ARRAY['notice'::"text", 'promotion'::"text", 'system'::"text"])))
);


--
-- Name: banner_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."banner_settings" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL
);


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "subtitle" "text" DEFAULT ''::"text" NOT NULL,
    "link_path" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: commission_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."commission_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_amount" numeric(12,2) NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "commission_type" "text" NOT NULL,
    "rate" numeric(6,4) NOT NULL,
    "amount" numeric(14,4) NOT NULL,
    "status" "text" DEFAULT 'settled'::"text" NOT NULL,
    "settled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commission_records_commission_type_check" CHECK (("commission_type" = ANY (ARRAY['merchant_bonus'::"text", 'boss_bonus'::"text", 'captain_direct'::"text", 'voucher_reserve'::"text"]))),
    CONSTRAINT "commission_records_status_check" CHECK (("status" = ANY (ARRAY['settled'::"text", 'pending'::"text", 'failed'::"text"])))
);


--
-- Name: coupon_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."coupon_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "face_value" numeric(12,2) NOT NULL,
    "min_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "valid_days" integer DEFAULT 30 NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "issued_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: daily_screenings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."daily_screenings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screening_date" "date" NOT NULL,
    "total_active" integer DEFAULT 0 NOT NULL,
    "screened_count" integer DEFAULT 0 NOT NULL,
    "ratio_used" numeric(5,4) DEFAULT 0.3 NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "triggered_by" "text" DEFAULT 'cron'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_screenings_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


--
-- Name: distribution_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."distribution_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "level" integer DEFAULT 1 NOT NULL,
    "path" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: elimination_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."elimination_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "reason_detail" "text",
    "eliminated_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "eliminated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "restored_at" timestamp with time zone,
    "restored_by" "text",
    "restore_note" "text",
    "reassess_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "elimination_records_reassess_status_check" CHECK ((("reassess_status" IS NULL) OR ("reassess_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))))
);


--
-- Name: exchange_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."exchange_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "points_cost" integer NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "exchanged" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "min_coupon_balance" integer DEFAULT 3776 NOT NULL,
    "min_direct_referrals" integer DEFAULT 3 NOT NULL,
    CONSTRAINT "exchange_items_points_cost_check" CHECK (("points_cost" > 0))
);


--
-- Name: COLUMN "exchange_items"."min_coupon_balance"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."exchange_items"."min_coupon_balance" IS '兑换前置：优惠券余额须≥该值';


--
-- Name: COLUMN "exchange_items"."min_direct_referrals"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."exchange_items"."min_direct_referrals" IS '兑换前置：直接推荐人数须≥该值';


--
-- Name: exchange_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."exchange_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "points_spent" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "remark" "text",
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exchange_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'shipped'::"text", 'completed'::"text", 'rejected'::"text"])))
);


--
-- Name: exchange_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."exchange_settings" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: featured_spotlight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."featured_spotlight" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "highlights" "text"[] DEFAULT '{}'::"text"[],
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "original_price" numeric(10,2),
    "image_url" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "product_id" "uuid",
    "cta_text" "text" DEFAULT '立即购买'::"text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: finance_risk_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."finance_risk_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_key" "text" NOT NULL,
    "rule_name" "text" NOT NULL,
    "threshold" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: homepage_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."homepage_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'banner'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "subtitle" "text" DEFAULT ''::"text" NOT NULL,
    "link_path" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "bg_gradient" "text" DEFAULT 'from-primary to-secondary'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: kyc_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."kyc_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "real_name" "text" NOT NULL,
    "id_card_no" "text" NOT NULL,
    "front_image_url" "text",
    "back_image_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ocr_result" "jsonb",
    "auto_verified" boolean DEFAULT false NOT NULL,
    "auto_verify_msg" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kyc_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: leader_qualification_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."leader_qualification_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "horizontal_count" integer DEFAULT 0,
    "vertical_count" integer DEFAULT 0,
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leader_qualification_reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: member_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."member_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "min_direct_referrals" integer DEFAULT 0 NOT NULL,
    "min_team_depth" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: mobile_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mobile_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: morning_incentive_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."morning_incentive_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deadline_hour" integer DEFAULT 12 NOT NULL,
    "deadline_minute" integer DEFAULT 0 NOT NULL,
    "reward_rate" numeric DEFAULT 0.002 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regular_first_order_limit" integer DEFAULT 2 NOT NULL,
    "trial_first_order_limit" integer DEFAULT 1 NOT NULL
);


--
-- Name: morning_reward_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."morning_reward_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "reward_amount" numeric NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "recipient_level" integer NOT NULL,
    "reward_rate" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "text" DEFAULT 'system'::"text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_broadcast" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['system'::"text", 'order'::"text", 'account'::"text", 'promotion'::"text"])))
);


--
-- Name: order_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."order_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_order_id" "uuid" NOT NULL,
    "split_order_a_id" "uuid",
    "split_order_b_id" "uuid",
    "original_amount" numeric(12,2) NOT NULL,
    "premium_amount" numeric(12,2) NOT NULL,
    "threshold_used" numeric(12,2) NOT NULL,
    "triggered_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_splits_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


--
-- Name: order_status_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."order_status_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "operator_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "operator_id" "uuid",
    "remark" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_status_logs_operator_type_check" CHECK (("operator_type" = ANY (ARRAY['system'::"text", 'buyer'::"text", 'seller'::"text", 'admin'::"text"])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_no" "text" NOT NULL,
    "buyer_id" "uuid",
    "seller_id" "uuid",
    "product_id" "uuid",
    "activity_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "payment_voucher_url" "text",
    "payment_time" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "admin_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resell_price" numeric,
    "resell_at" timestamp with time zone,
    "is_resell" boolean DEFAULT false NOT NULL,
    "voucher_flagged" boolean DEFAULT false,
    "voucher_flag_note" "text",
    "settled_at" timestamp with time zone,
    "service_fee" numeric DEFAULT 0,
    "net_amount" numeric,
    "is_rush" boolean DEFAULT false NOT NULL,
    "rush_slot_id" "uuid",
    "rush_activity_id" "uuid",
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'payment_uploaded'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'disputed'::"text", 'resell_listed'::"text"])))
);


--
-- Name: COLUMN "orders"."is_rush"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."orders"."is_rush" IS '是否为进货区订单（含进货快闪和进货活动），用于判断正式商家升级资格';


--
-- Name: page_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."page_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "subtitle" "text" DEFAULT ''::"text" NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."payment_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "account_no" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "bank_name" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['bank'::"text", 'alipay'::"text", 'wechat'::"text"])))
);


--
-- Name: platform_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."platform_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "icon_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid",
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "original_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "consignment_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "consignment_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "storage_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "generation" integer DEFAULT 1 NOT NULL,
    "parent_product_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "condition" "text" DEFAULT '全新'::"text",
    "specs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "origin_order_id" "uuid",
    "is_resell" boolean DEFAULT false NOT NULL,
    "resell_premium_rate" numeric DEFAULT 0.03 NOT NULL,
    "resell_at" timestamp with time zone,
    CONSTRAINT "products_condition_check" CHECK (("condition" = ANY (ARRAY['全新'::"text", '99新'::"text", '9.5新'::"text", '9新'::"text", '8.5新'::"text", '8新'::"text", '7新'::"text", '其他'::"text"]))),
    CONSTRAINT "products_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'sold'::"text", 'withdrawn'::"text"])))
);


--
-- Name: COLUMN "products"."condition"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."products"."condition" IS '商品成色：全新/99新/9.5新/9新/8.5新/8新/7新/其他';


--
-- Name: COLUMN "products"."specs"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."products"."specs" IS '商品规格参数，键值对JSON，如 {"品牌":"Apple","型号":"iPhone 15 Pro"}';


--
-- Name: referral_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."referral_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "skipped_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'settled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: rush_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rush_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "activity_date" "date" NOT NULL,
    "start_minute" integer NOT NULL,
    "end_minute" integer NOT NULL,
    "session_type" "text" DEFAULT 'formal'::"text" NOT NULL,
    "price_discount" numeric DEFAULT 1 NOT NULL,
    "priority" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rush_activities_session_type_check" CHECK (("session_type" = ANY (ARRAY['early'::"text", 'formal'::"text"])))
);


--
-- Name: rush_early_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rush_early_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by_admin" "text",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_at" timestamp with time zone,
    "notes" "text"
);


--
-- Name: rush_time_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rush_time_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "start_minute" integer NOT NULL,
    "end_minute" integer NOT NULL,
    "price_discount" numeric(4,2) DEFAULT 1.00 NOT NULL,
    "priority" integer DEFAULT 10 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_type" "text" DEFAULT 'formal'::"text" NOT NULL,
    CONSTRAINT "rush_time_slots_end_minute_check" CHECK ((("end_minute" >= 0) AND ("end_minute" <= 1440))),
    CONSTRAINT "rush_time_slots_price_discount_check" CHECK ((("price_discount" > (0)::numeric) AND ("price_discount" <= 1.00))),
    CONSTRAINT "rush_time_slots_priority_check" CHECK (("priority" >= 1)),
    CONSTRAINT "rush_time_slots_session_type_check" CHECK (("session_type" = ANY (ARRAY['early'::"text", 'formal'::"text"]))),
    CONSTRAINT "rush_time_slots_start_minute_check" CHECK ((("start_minute" >= 0) AND ("start_minute" < 1440))),
    CONSTRAINT "valid_time_range" CHECK (("end_minute" > "start_minute"))
);


--
-- Name: screening_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."screening_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screening_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "screened_date" "date" NOT NULL,
    "restored_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deducted_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "deduction_restored" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone,
    "expired" boolean DEFAULT false NOT NULL
);


--
-- Name: system_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."system_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_key" "text" NOT NULL,
    "config_value" "text" NOT NULL,
    "value_type" "text" DEFAULT 'string'::"text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "group_name" "text" DEFAULT 'general'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: team_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."team_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "leader_user_id" "uuid" NOT NULL,
    "sub_mall_name" "text" NOT NULL,
    "sub_mall_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "team_shop_count" integer DEFAULT 0 NOT NULL,
    "team_volume" numeric(14,2) DEFAULT 0 NOT NULL,
    "triggered_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_splits_sub_mall_status_check" CHECK (("sub_mall_status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'closed'::"text"])))
);


--
-- Name: transfer_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."transfer_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "from_order_id" "uuid" NOT NULL,
    "new_order_id" "uuid",
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transfer_records_type_check" CHECK (("type" = ANY (ARRAY['resell'::"text", 'gift'::"text"])))
);


--
-- Name: virtual_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."virtual_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "balance" numeric(14,4) DEFAULT 0 NOT NULL,
    "total_in" numeric(14,4) DEFAULT 0 NOT NULL,
    "total_out" numeric(14,4) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "virtual_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['bonus'::"text", 'balance'::"text", 'points'::"text", 'coupon'::"text", 'promotion'::"text"]))),
    CONSTRAINT "virtual_accounts_balance_check" CHECK (("balance" >= (0)::numeric))
);


--
-- Name: user_accounts; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."user_accounts" AS
 SELECT "id",
    "user_id",
    "account_type",
    "balance",
    (0)::numeric(14,4) AS "frozen_balance",
    "total_in",
    "total_out",
    "updated_at"
   FROM "public"."virtual_accounts";


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "receiver_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "province" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "district" "text" DEFAULT ''::"text" NOT NULL,
    "detail" "text" DEFAULT ''::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trial_start_at" timestamp with time zone NOT NULL,
    "trial_end_at" timestamp with time zone NOT NULL,
    "orders_completed" integer DEFAULT 0 NOT NULL,
    "invites_completed" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "auto_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_assessments_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'passed'::"text", 'failed'::"text", 'manual_pass'::"text", 'manual_fail'::"text"])))
);


--
-- Name: user_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "face_value" numeric(12,2) NOT NULL,
    "expired_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'unused'::"text" NOT NULL,
    "used_at" timestamp with time zone,
    "used_order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_coupons_status_check" CHECK (("status" = ANY (ARRAY['unused'::"text", 'used'::"text", 'expired'::"text"])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "nickname" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "kyc_status" "text" DEFAULT 'unsubmitted'::"text" NOT NULL,
    "member_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "invite_code" "text" DEFAULT "upper"("substr"("md5"(("random"())::"text"), 1, 8)) NOT NULL,
    "referrer_id" "uuid",
    "is_banned" boolean DEFAULT false NOT NULL,
    "ban_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "password" "text",
    "merchant_type" "text" DEFAULT 'trial'::"text" NOT NULL,
    "consecutive_missed" integer DEFAULT 0 NOT NULL,
    "user_status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "trial_start_at" timestamp with time zone,
    "trial_end_at" timestamp with time zone,
    "assessment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "promoted_at" timestamp with time zone,
    "eliminated_at" timestamp with time zone,
    "screening_today" boolean DEFAULT false NOT NULL,
    "last_referral_order_at" timestamp with time zone,
    "eat_soil_deducted" boolean DEFAULT false NOT NULL,
    "real_name" "text",
    "id_card_no" "text",
    "signature_data" "text",
    "register_step" smallint DEFAULT 0,
    "id_card_front_url" "text",
    "id_card_back_url" "text",
    "exit_request_at" timestamp with time zone,
    "exit_request_note" "text",
    "rush_skipped_today" boolean DEFAULT false NOT NULL,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_assessment_status_check" CHECK (("assessment_status" = ANY (ARRAY['pending'::"text", 'passed'::"text", 'failed'::"text", 'manual_pass'::"text", 'manual_fail'::"text"]))),
    CONSTRAINT "users_kyc_status_check" CHECK (("kyc_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'unsubmitted'::"text"]))),
    CONSTRAINT "users_member_level_check" CHECK (("member_level" = ANY (ARRAY['normal'::"text", 'member'::"text", 'captain'::"text"]))),
    CONSTRAINT "users_merchant_type_check" CHECK (("merchant_type" = ANY (ARRAY['trial'::"text", 'regular'::"text"]))),
    CONSTRAINT "users_user_status_check" CHECK (("user_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'eliminated'::"text", 'frozen'::"text"])))
);


--
-- Name: voucher_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."voucher_pool" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "accumulated" numeric(14,4) DEFAULT 0 NOT NULL,
    "threshold" numeric(14,4) DEFAULT 3367 NOT NULL,
    "total_exchanged_count" integer DEFAULT 0 NOT NULL,
    "last_exchange_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: voucher_redeem_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."voucher_redeem_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "pool_snapshot" numeric DEFAULT 0 NOT NULL,
    "direct_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "reviewer_note" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "voucher_redeem_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."withdrawal_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "amount" numeric(14,4) NOT NULL,
    "bank_name" "text",
    "bank_account" "text",
    "bank_holder" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "risk_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "review_stage" "text" DEFAULT 'pending'::"text" NOT NULL,
    "review_notes" "text",
    "reviewer_name" "text",
    "paid_by" "uuid",
    CONSTRAINT "withdrawal_requests_account_type_check" CHECK (("account_type" = ANY (ARRAY['points'::"text", 'promotion'::"text"]))),
    CONSTRAINT "withdrawal_requests_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "withdrawal_requests_review_stage_check" CHECK (("review_stage" = ANY (ARRAY['pending'::"text", 'initial_review'::"text", 'secondary_review'::"text", 'final_approval'::"text", 'completed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "withdrawal_requests_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['normal'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "withdrawal_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'paid'::"text"])))
);


--
-- Name: withdrawal_review_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."withdrawal_review_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "withdrawal_id" "uuid" NOT NULL,
    "reviewer_id" "uuid",
    "reviewer_name" "text",
    "action" "text" NOT NULL,
    "stage" "text" DEFAULT 'pending'::"text" NOT NULL,
    "comment" "text",
    "amount" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "withdrawal_review_logs_action_check" CHECK (("action" = ANY (ARRAY['submit'::"text", 'initial_approve'::"text", 'initial_reject'::"text", 'secondary_approve'::"text", 'secondary_reject'::"text", 'final_approve'::"text", 'final_reject'::"text", 'mark_paid'::"text", 'note_added'::"text"])))
);


--
-- Name: account_transactions account_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'account_transactions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."account_transactions"
    ADD CONSTRAINT "account_transactions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'activities_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'activities'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activity_products activity_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'activity_products_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'activity_products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."activity_products"
    ADD CONSTRAINT "activity_products_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_operation_logs admin_operation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_operation_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_operation_logs"
    ADD CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_profiles_email_key'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_email_key" UNIQUE ("email");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_users_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_users_username_key'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_username_key" UNIQUE ("username");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'announcements_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: banner_settings banner_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'banner_settings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'banner_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."banner_settings"
    ADD CONSTRAINT "banner_settings_pkey" PRIMARY KEY ("key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'banners_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'banners'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commission_records commission_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commission_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'commission_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupon_templates coupon_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'coupon_templates_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'coupon_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."coupon_templates"
    ADD CONSTRAINT "coupon_templates_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: daily_screenings daily_screenings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'daily_screenings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'daily_screenings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."daily_screenings"
    ADD CONSTRAINT "daily_screenings_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: daily_screenings daily_screenings_screening_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'daily_screenings_screening_date_key'
      AND n.nspname = 'public'
      AND c.relname = 'daily_screenings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."daily_screenings"
    ADD CONSTRAINT "daily_screenings_screening_date_key" UNIQUE ("screening_date");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations distribution_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'distribution_relations_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."distribution_relations"
    ADD CONSTRAINT "distribution_relations_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations distribution_relations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'distribution_relations_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."distribution_relations"
    ADD CONSTRAINT "distribution_relations_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: elimination_records elimination_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'elimination_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'elimination_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."elimination_records"
    ADD CONSTRAINT "elimination_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_items exchange_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'exchange_items_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."exchange_items"
    ADD CONSTRAINT "exchange_items_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_orders exchange_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'exchange_orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."exchange_orders"
    ADD CONSTRAINT "exchange_orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_settings exchange_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'exchange_settings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."exchange_settings"
    ADD CONSTRAINT "exchange_settings_pkey" PRIMARY KEY ("key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: featured_spotlight featured_spotlight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'featured_spotlight_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'featured_spotlight'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."featured_spotlight"
    ADD CONSTRAINT "featured_spotlight_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: finance_risk_rules finance_risk_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'finance_risk_rules_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'finance_risk_rules'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."finance_risk_rules"
    ADD CONSTRAINT "finance_risk_rules_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: finance_risk_rules finance_risk_rules_rule_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'finance_risk_rules_rule_key_key'
      AND n.nspname = 'public'
      AND c.relname = 'finance_risk_rules'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."finance_risk_rules"
    ADD CONSTRAINT "finance_risk_rules_rule_key_key" UNIQUE ("rule_key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: homepage_blocks homepage_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'homepage_blocks_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'homepage_blocks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."homepage_blocks"
    ADD CONSTRAINT "homepage_blocks_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications kyc_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'kyc_applications_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."kyc_applications"
    ADD CONSTRAINT "kyc_applications_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: leader_qualification_reviews leader_qualification_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'leader_qualification_reviews_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'leader_qualification_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."leader_qualification_reviews"
    ADD CONSTRAINT "leader_qualification_reviews_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: member_levels member_levels_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'member_levels_code_key'
      AND n.nspname = 'public'
      AND c.relname = 'member_levels'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."member_levels"
    ADD CONSTRAINT "member_levels_code_key" UNIQUE ("code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: member_levels member_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'member_levels_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'member_levels'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."member_levels"
    ADD CONSTRAINT "member_levels_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mobile_sessions mobile_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mobile_sessions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'mobile_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mobile_sessions"
    ADD CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mobile_sessions mobile_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mobile_sessions_token_key'
      AND n.nspname = 'public'
      AND c.relname = 'mobile_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mobile_sessions"
    ADD CONSTRAINT "mobile_sessions_token_key" UNIQUE ("token");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_incentive_config morning_incentive_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'morning_incentive_config_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'morning_incentive_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."morning_incentive_config"
    ADD CONSTRAINT "morning_incentive_config_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_reward_records morning_reward_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'morning_reward_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."morning_reward_records"
    ADD CONSTRAINT "morning_reward_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notifications_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_splits order_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_splits_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_splits'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status_logs order_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_status_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_status_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_status_logs"
    ADD CONSTRAINT "order_status_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_order_no_key'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_sections page_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'page_sections_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'page_sections'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."page_sections"
    ADD CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_sections page_sections_section_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'page_sections_section_key_key'
      AND n.nspname = 'public'
      AND c.relname = 'page_sections'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."page_sections"
    ADD CONSTRAINT "page_sections_section_key_key" UNIQUE ("section_key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_accounts payment_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'payment_accounts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'payment_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: platform_agreements platform_agreements_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'platform_agreements_code_key'
      AND n.nspname = 'public'
      AND c.relname = 'platform_agreements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."platform_agreements"
    ADD CONSTRAINT "platform_agreements_code_key" UNIQUE ("code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: platform_agreements platform_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'platform_agreements_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'platform_agreements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."platform_agreements"
    ADD CONSTRAINT "platform_agreements_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_categories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards referral_rewards_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'referral_rewards_order_id_unique'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_order_id_unique" UNIQUE ("order_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'referral_rewards_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_activities rush_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rush_activities_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rush_activities'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rush_activities"
    ADD CONSTRAINT "rush_activities_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_early_access rush_early_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rush_early_access_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rush_early_access'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rush_early_access"
    ADD CONSTRAINT "rush_early_access_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_early_access rush_early_access_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rush_early_access_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'rush_early_access'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rush_early_access"
    ADD CONSTRAINT "rush_early_access_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_time_slots rush_time_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rush_time_slots_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rush_time_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rush_time_slots"
    ADD CONSTRAINT "rush_time_slots_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: screening_records screening_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'screening_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'screening_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."screening_records"
    ADD CONSTRAINT "screening_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs system_configs_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'system_configs_config_key_key'
      AND n.nspname = 'public'
      AND c.relname = 'system_configs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."system_configs"
    ADD CONSTRAINT "system_configs_config_key_key" UNIQUE ("config_key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs system_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'system_configs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'system_configs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."system_configs"
    ADD CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'system_settings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'system_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: team_splits team_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'team_splits_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'team_splits'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."team_splits"
    ADD CONSTRAINT "team_splits_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_addresses_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_assessments user_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_assessments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_assessments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_assessments"
    ADD CONSTRAINT "user_assessments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_coupons user_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_coupons_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_coupons"
    ADD CONSTRAINT "user_coupons_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users users_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_invite_code_key'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_invite_code_key" UNIQUE ("invite_code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_phone_key'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts virtual_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'virtual_accounts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."virtual_accounts"
    ADD CONSTRAINT "virtual_accounts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts virtual_accounts_user_id_account_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'virtual_accounts_user_id_account_type_key'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."virtual_accounts"
    ADD CONSTRAINT "virtual_accounts_user_id_account_type_key" UNIQUE ("user_id", "account_type");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_pool voucher_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'voucher_pool_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_pool'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."voucher_pool"
    ADD CONSTRAINT "voucher_pool_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_redeem_requests voucher_redeem_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'voucher_redeem_requests_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_redeem_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."voucher_redeem_requests"
    ADD CONSTRAINT "voucher_redeem_requests_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_requests_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_review_logs withdrawal_review_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_review_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_review_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_review_logs"
    ADD CONSTRAINT "withdrawal_review_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: idx_admin_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_admin_logs_action" ON "public"."admin_operation_logs" USING "btree" ("action_type");


--
-- Name: idx_admin_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_admin_logs_created" ON "public"."admin_operation_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_elimination_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_elimination_records_user" ON "public"."elimination_records" USING "btree" ("user_id");


--
-- Name: idx_featured_spotlight_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_featured_spotlight_active" ON "public"."featured_spotlight" USING "btree" ("is_active", "sort_order");


--
-- Name: idx_kyc_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_kyc_applications_status" ON "public"."kyc_applications" USING "btree" ("status");


--
-- Name: idx_kyc_applications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_kyc_applications_user_id" ON "public"."kyc_applications" USING "btree" ("user_id");


--
-- Name: idx_leader_qual_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_leader_qual_status" ON "public"."leader_qualification_reviews" USING "btree" ("status");


--
-- Name: idx_leader_qual_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_leader_qual_user" ON "public"."leader_qualification_reviews" USING "btree" ("user_id");


--
-- Name: idx_morning_reward_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_morning_reward_order" ON "public"."morning_reward_records" USING "btree" ("order_id");


--
-- Name: idx_morning_reward_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_morning_reward_recipient" ON "public"."morning_reward_records" USING "btree" ("recipient_id", "created_at" DESC);


--
-- Name: idx_order_splits_original; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_order_splits_original" ON "public"."order_splits" USING "btree" ("original_order_id");


--
-- Name: idx_products_resell_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_products_resell_at" ON "public"."products" USING "btree" ("resell_at" DESC) WHERE ("is_resell" = true);


--
-- Name: idx_referral_rewards_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_referral_rewards_buyer" ON "public"."referral_rewards" USING "btree" ("buyer_id");


--
-- Name: idx_referral_rewards_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_referral_rewards_order_id" ON "public"."referral_rewards" USING "btree" ("order_id");


--
-- Name: idx_referral_rewards_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_referral_rewards_recipient" ON "public"."referral_rewards" USING "btree" ("recipient_id");


--
-- Name: idx_rush_time_slots_active_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_rush_time_slots_active_priority" ON "public"."rush_time_slots" USING "btree" ("is_active", "priority");


--
-- Name: idx_screening_records_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_screening_records_batch" ON "public"."screening_records" USING "btree" ("screening_id");


--
-- Name: idx_screening_records_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_screening_records_date" ON "public"."screening_records" USING "btree" ("screened_date");


--
-- Name: idx_screening_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_screening_records_user" ON "public"."screening_records" USING "btree" ("user_id");


--
-- Name: idx_team_splits_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_team_splits_leader" ON "public"."team_splits" USING "btree" ("leader_user_id");


--
-- Name: idx_user_assessments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_user_assessments_status" ON "public"."user_assessments" USING "btree" ("status");


--
-- Name: idx_user_assessments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_user_assessments_user_id" ON "public"."user_assessments" USING "btree" ("user_id");


--
-- Name: idx_withdrawal_requests_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_withdrawal_requests_risk" ON "public"."withdrawal_requests" USING "btree" ("risk_level") WHERE ("risk_level" <> 'normal'::"text");


--
-- Name: idx_withdrawal_requests_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_withdrawal_requests_stage" ON "public"."withdrawal_requests" USING "btree" ("review_stage");


--
-- Name: idx_withdrawal_review_logs_withdrawal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_withdrawal_review_logs_withdrawal" ON "public"."withdrawal_review_logs" USING "btree" ("withdrawal_id");


--
-- Name: admin_profiles admin_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "admin_profiles_updated_at" BEFORE UPDATE ON "public"."admin_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders trg_order_no; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_order_no" BEFORE INSERT ON "public"."orders" FOR EACH ROW WHEN ((("new"."order_no" IS NULL) OR ("new"."order_no" = ''::"text"))) EXECUTE FUNCTION "public"."generate_order_no"();


--
-- Name: users trg_users_password_policy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_users_password_policy" BEFORE INSERT OR UPDATE OF "password" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_password_policy"();


--
-- Name: account_transactions account_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'account_transactions_account_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."account_transactions"
    ADD CONSTRAINT "account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."virtual_accounts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: account_transactions account_transactions_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'account_transactions_related_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."account_transactions"
    ADD CONSTRAINT "account_transactions_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: account_transactions account_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'account_transactions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."account_transactions"
    ADD CONSTRAINT "account_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activities activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'activities_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'activities'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activity_products activity_products_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'activity_products_activity_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'activity_products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."activity_products"
    ADD CONSTRAINT "activity_products_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activity_products activity_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'activity_products_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'activity_products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."activity_products"
    ADD CONSTRAINT "activity_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin_users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'admin_users_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'announcements_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commission_records commission_records_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commission_records_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'commission_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commission_records commission_records_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commission_records_recipient_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'commission_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupon_templates coupon_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'coupon_templates_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'coupon_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."coupon_templates"
    ADD CONSTRAINT "coupon_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations distribution_relations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'distribution_relations_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."distribution_relations"
    ADD CONSTRAINT "distribution_relations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations distribution_relations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'distribution_relations_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."distribution_relations"
    ADD CONSTRAINT "distribution_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: elimination_records elimination_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'elimination_records_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'elimination_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."elimination_records"
    ADD CONSTRAINT "elimination_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_orders exchange_orders_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'exchange_orders_item_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."exchange_orders"
    ADD CONSTRAINT "exchange_orders_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."exchange_items"("id") ON DELETE RESTRICT;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_orders exchange_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'exchange_orders_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."exchange_orders"
    ADD CONSTRAINT "exchange_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: featured_spotlight featured_spotlight_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'featured_spotlight_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'featured_spotlight'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."featured_spotlight"
    ADD CONSTRAINT "featured_spotlight_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications kyc_applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'kyc_applications_reviewed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."kyc_applications"
    ADD CONSTRAINT "kyc_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications kyc_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'kyc_applications_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."kyc_applications"
    ADD CONSTRAINT "kyc_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: leader_qualification_reviews leader_qualification_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'leader_qualification_reviews_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'leader_qualification_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."leader_qualification_reviews"
    ADD CONSTRAINT "leader_qualification_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mobile_sessions mobile_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mobile_sessions_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mobile_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mobile_sessions"
    ADD CONSTRAINT "mobile_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_reward_records morning_reward_records_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'morning_reward_records_buyer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."morning_reward_records"
    ADD CONSTRAINT "morning_reward_records_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_reward_records morning_reward_records_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'morning_reward_records_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."morning_reward_records"
    ADD CONSTRAINT "morning_reward_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_reward_records morning_reward_records_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'morning_reward_records_recipient_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."morning_reward_records"
    ADD CONSTRAINT "morning_reward_records_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notifications_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status_logs order_status_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_status_logs_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_status_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_status_logs"
    ADD CONSTRAINT "order_status_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_activity_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_buyer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_rush_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_rush_activity_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rush_activity_id_fkey" FOREIGN KEY ("rush_activity_id") REFERENCES "public"."rush_activities"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_rush_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_rush_slot_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rush_slot_id_fkey" FOREIGN KEY ("rush_slot_id") REFERENCES "public"."rush_time_slots"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_seller_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_accounts payment_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'payment_accounts_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'payment_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: platform_agreements platform_agreements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'platform_agreements_updated_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'platform_agreements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."platform_agreements"
    ADD CONSTRAINT "platform_agreements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_categories product_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_categories_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_category_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_origin_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_origin_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_origin_order_id_fkey" FOREIGN KEY ("origin_order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_parent_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_parent_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_reviewed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_seller_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards referral_rewards_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'referral_rewards_buyer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards referral_rewards_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'referral_rewards_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards referral_rewards_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'referral_rewards_recipient_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_early_access rush_early_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rush_early_access_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rush_early_access'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rush_early_access"
    ADD CONSTRAINT "rush_early_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: screening_records screening_records_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'screening_records_screening_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'screening_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."screening_records"
    ADD CONSTRAINT "screening_records_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "public"."daily_screenings"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: screening_records screening_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'screening_records_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'screening_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."screening_records"
    ADD CONSTRAINT "screening_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: team_splits team_splits_leader_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'team_splits_leader_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'team_splits'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."team_splits"
    ADD CONSTRAINT "team_splits_leader_user_id_fkey" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_from_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_from_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_from_order_id_fkey" FOREIGN KEY ("from_order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_from_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_new_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_new_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_new_order_id_fkey" FOREIGN KEY ("new_order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records transfer_records_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfer_records_to_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfer_records"
    ADD CONSTRAINT "transfer_records_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_addresses_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_assessments user_assessments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_assessments_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_assessments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_assessments"
    ADD CONSTRAINT "user_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_coupons user_coupons_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_coupons_template_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_coupons"
    ADD CONSTRAINT "user_coupons_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."coupon_templates"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_coupons user_coupons_used_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_coupons_used_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_coupons"
    ADD CONSTRAINT "user_coupons_used_order_id_fkey" FOREIGN KEY ("used_order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_coupons user_coupons_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_coupons_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_coupons"
    ADD CONSTRAINT "user_coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users users_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_referrer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts virtual_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'virtual_accounts_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."virtual_accounts"
    ADD CONSTRAINT "virtual_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_redeem_requests voucher_redeem_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'voucher_redeem_requests_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_redeem_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."voucher_redeem_requests"
    ADD CONSTRAINT "voucher_redeem_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests withdrawal_requests_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_requests_paid_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests withdrawal_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_requests_reviewed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests withdrawal_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_requests_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_review_logs withdrawal_review_logs_withdrawal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawal_review_logs_withdrawal_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_review_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawal_review_logs"
    ADD CONSTRAINT "withdrawal_review_logs_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawal_requests"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_operation_logs Admins can insert operation logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Admins can insert operation logs'
      AND n.nspname = 'public'
      AND c.relname = 'admin_operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Admins can insert operation logs" ON "public"."admin_operation_logs" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: leader_qualification_reviews Admins can manage leader reviews; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Admins can manage leader reviews'
      AND n.nspname = 'public'
      AND c.relname = 'leader_qualification_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Admins can manage leader reviews" ON "public"."leader_qualification_reviews" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_operation_logs Admins can read operation logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Admins can read operation logs'
      AND n.nspname = 'public'
      AND c.relname = 'admin_operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Admins can read operation logs" ON "public"."admin_operation_logs" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: account_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."account_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."activity_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: account_transactions admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."account_transactions" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activities admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'activities'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."activities" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activity_products admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'activity_products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."activity_products" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'admin_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."admin_users" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."announcements" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commission_records admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'commission_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."commission_records" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupon_templates admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'coupon_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."coupon_templates" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."distribution_relations" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."kyc_applications" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: member_levels admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'member_levels'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."member_levels" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mobile_sessions admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'mobile_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."mobile_sessions" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."notifications" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status_logs admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'order_status_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."order_status_logs" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."orders" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_accounts admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'payment_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."payment_accounts" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: platform_agreements admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'platform_agreements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."platform_agreements" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_categories admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'product_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."product_categories" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."products" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_settings admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'system_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."system_settings" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfer_records admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'transfer_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."transfer_records" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."user_addresses" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_coupons admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'user_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."user_coupons" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."users" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."virtual_accounts" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_pool admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_pool'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."voucher_pool" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests admin full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access" ON "public"."withdrawal_requests" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_early_access admin full access rush_early_access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin full access rush_early_access'
      AND n.nspname = 'public'
      AND c.relname = 'rush_early_access'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin full access rush_early_access" ON "public"."rush_early_access" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: page_sections admin_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all'
      AND n.nspname = 'public'
      AND c.relname = 'page_sections'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all" ON "public"."page_sections" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: featured_spotlight admin_all_featured_spotlight; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_featured_spotlight'
      AND n.nspname = 'public'
      AND c.relname = 'featured_spotlight'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_featured_spotlight" ON "public"."featured_spotlight" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_review_logs admin_all_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_logs'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_review_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_logs" ON "public"."withdrawal_review_logs" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: referral_rewards admin_all_referral_rewards; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_referral_rewards'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_referral_rewards" ON "public"."referral_rewards" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: finance_risk_rules admin_all_rules; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_rules'
      AND n.nspname = 'public'
      AND c.relname = 'finance_risk_rules'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_rules" ON "public"."finance_risk_rules" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_operation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_operation_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_profiles admin_profiles_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_profiles_delete'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_profiles_delete" ON "public"."admin_profiles" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_profiles_insert'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_profiles_insert" ON "public"."admin_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_profiles_select'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_profiles_select" ON "public"."admin_profiles" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_profiles admin_profiles_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_profiles_update'
      AND n.nspname = 'public'
      AND c.relname = 'admin_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_profiles_update" ON "public"."admin_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications admin_update_kyc; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_update_kyc'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_update_kyc" ON "public"."kyc_applications" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: rush_time_slots admins can manage rush_time_slots; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admins can manage rush_time_slots'
      AND n.nspname = 'public'
      AND c.relname = 'rush_time_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admins can manage rush_time_slots" ON "public"."rush_time_slots" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."id" = "auth"."uid"()) AND ("ap"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."id" = "auth"."uid"()) AND ("ap"."is_active" = true)))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: banner_settings allow_all_banner_settings; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_all_banner_settings'
      AND n.nspname = 'public'
      AND c.relname = 'banner_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "allow_all_banner_settings" ON "public"."banner_settings" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: banners allow_all_banners; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_all_banners'
      AND n.nspname = 'public'
      AND c.relname = 'banners'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "allow_all_banners" ON "public"."banners" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

--
-- Name: mobile_sessions anon full access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon full access'
      AND n.nspname = 'public'
      AND c.relname = 'mobile_sessions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon full access" ON "public"."mobile_sessions" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: account_transactions anon insert transactions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon insert transactions'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon insert transactions" ON "public"."account_transactions" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activities anon read activities; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read activities'
      AND n.nspname = 'public'
      AND c.relname = 'activities'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read activities" ON "public"."activities" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: activity_products anon read activity_products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read activity_products'
      AND n.nspname = 'public'
      AND c.relname = 'activity_products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read activity_products" ON "public"."activity_products" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: platform_agreements anon read agreements; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read agreements'
      AND n.nspname = 'public'
      AND c.relname = 'platform_agreements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read agreements" ON "public"."platform_agreements" FOR SELECT TO "anon" USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements anon read announcements; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read announcements'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read announcements" ON "public"."announcements" FOR SELECT TO "anon" USING (("status" = 'published'::"text"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_categories anon read categories; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read categories'
      AND n.nspname = 'public'
      AND c.relname = 'product_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read categories" ON "public"."product_categories" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commission_records anon read commission; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read commission'
      AND n.nspname = 'public'
      AND c.relname = 'commission_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read commission" ON "public"."commission_records" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations anon read distribution; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read distribution'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read distribution" ON "public"."distribution_relations" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: member_levels anon read levels; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read levels'
      AND n.nspname = 'public'
      AND c.relname = 'member_levels'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read levels" ON "public"."member_levels" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications anon read notifications; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read notifications'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read notifications" ON "public"."notifications" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status_logs anon read order_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read order_logs'
      AND n.nspname = 'public'
      AND c.relname = 'order_status_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read order_logs" ON "public"."order_status_logs" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products anon read products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read products'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read products" ON "public"."products" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: account_transactions anon read transactions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read transactions'
      AND n.nspname = 'public'
      AND c.relname = 'account_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read transactions" ON "public"."account_transactions" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users anon read users; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read users'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read users" ON "public"."users" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts anon read virtual_accounts; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read virtual_accounts'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read virtual_accounts" ON "public"."virtual_accounts" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_pool anon read voucher_pool; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon read voucher_pool'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_pool'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon read voucher_pool" ON "public"."voucher_pool" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users anon update own kyc_status; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon update own kyc_status'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon update own kyc_status" ON "public"."users" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts anon update virtual_accounts; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon update virtual_accounts'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon update virtual_accounts" ON "public"."virtual_accounts" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: voucher_pool anon update voucher_pool; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon update voucher_pool'
      AND n.nspname = 'public'
      AND c.relname = 'voucher_pool'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon update voucher_pool" ON "public"."voucher_pool" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: distribution_relations anon write distribution; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write distribution'
      AND n.nspname = 'public'
      AND c.relname = 'distribution_relations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write distribution" ON "public"."distribution_relations" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications anon write kyc; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write kyc'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write kyc" ON "public"."kyc_applications" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status_logs anon write order_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write order_logs'
      AND n.nspname = 'public'
      AND c.relname = 'order_status_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write order_logs" ON "public"."order_status_logs" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders anon write orders; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write orders'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write orders" ON "public"."orders" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_accounts anon write payment_accounts; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write payment_accounts'
      AND n.nspname = 'public'
      AND c.relname = 'payment_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write payment_accounts" ON "public"."payment_accounts" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products anon write products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write products'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write products" ON "public"."products" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses anon write user_addresses; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write user_addresses'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write user_addresses" ON "public"."user_addresses" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users anon write users; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write users'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write users" ON "public"."users" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts anon write virtual_accounts; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write virtual_accounts'
      AND n.nspname = 'public'
      AND c.relname = 'virtual_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write virtual_accounts" ON "public"."virtual_accounts" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawal_requests anon write withdrawal; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon write withdrawal'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon write withdrawal" ON "public"."withdrawal_requests" TO "anon" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_time_slots anyone can read rush_time_slots; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anyone can read rush_time_slots'
      AND n.nspname = 'public'
      AND c.relname = 'rush_time_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anyone can read rush_time_slots" ON "public"."rush_time_slots" FOR SELECT TO "authenticated", "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs authenticated_read_system_configs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_read_system_configs'
      AND n.nspname = 'public'
      AND c.relname = 'system_configs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_read_system_configs" ON "public"."system_configs" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs authenticated_write_system_configs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_write_system_configs'
      AND n.nspname = 'public'
      AND c.relname = 'system_configs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_write_system_configs" ON "public"."system_configs" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: banner_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."banner_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commission_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: morning_incentive_config config_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'config_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'morning_incentive_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "config_select_all" ON "public"."morning_incentive_config" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_incentive_config config_update_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'config_update_admin'
      AND n.nspname = 'public'
      AND c.relname = 'morning_incentive_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "config_update_admin" ON "public"."morning_incentive_config" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;

-- Name: morning_incentive_config config_insert_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'config_insert_admin'
      AND n.nspname = 'public'
      AND c.relname = 'morning_incentive_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "config_insert_admin" ON "public"."morning_incentive_config" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupon_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."coupon_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_screenings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."daily_screenings" ENABLE ROW LEVEL SECURITY;

--
-- Name: distribution_relations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."distribution_relations" ENABLE ROW LEVEL SECURITY;

--
-- Name: elimination_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."elimination_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exchange_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_items exchange_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_items_admin_all'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "exchange_items_admin_all" ON "public"."exchange_items" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_items exchange_items_public_read; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_items_public_read'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "exchange_items_public_read" ON "public"."exchange_items" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exchange_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_orders exchange_orders_admin_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_orders_admin_all'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "exchange_orders_admin_all" ON "public"."exchange_orders" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: exchange_orders exchange_orders_user_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_orders_user_own'
      AND n.nspname = 'public'
      AND c.relname = 'exchange_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "exchange_orders_user_own" ON "public"."exchange_orders" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: featured_spotlight; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."featured_spotlight" ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_risk_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."finance_risk_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."homepage_blocks" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_blocks homepage_blocks_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'homepage_blocks_all'
      AND n.nspname = 'public'
      AND c.relname = 'homepage_blocks'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "homepage_blocks_all" ON "public"."homepage_blocks" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."kyc_applications" ENABLE ROW LEVEL SECURITY;

--
-- Name: leader_qualification_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."leader_qualification_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: member_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."member_levels" ENABLE ROW LEVEL SECURITY;

--
-- Name: mobile_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mobile_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: morning_incentive_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."morning_incentive_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: morning_reward_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."morning_reward_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_splits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."order_splits" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."order_status_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: page_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."page_sections" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."platform_agreements" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."referral_rewards" ENABLE ROW LEVEL SECURITY;

--
-- Name: morning_reward_records reward_insert_service; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'reward_insert_service'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "reward_insert_service" ON "public"."morning_reward_records" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: morning_reward_records reward_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'reward_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'morning_reward_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "reward_select_all" ON "public"."morning_reward_records" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rush_activities" ENABLE ROW LEVEL SECURITY;

--
-- Name: rush_activities rush_activities_admin_write; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rush_activities_admin_write'
      AND n.nspname = 'public'
      AND c.relname = 'rush_activities'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rush_activities_admin_write" ON "public"."rush_activities" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."id" = "auth"."uid"()) AND ("ap"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."id" = "auth"."uid"()) AND ("ap"."is_active" = true)))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_activities rush_activities_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rush_activities_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'rush_activities'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rush_activities_select_all" ON "public"."rush_activities" FOR SELECT TO "authenticated", "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rush_early_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rush_early_access" ENABLE ROW LEVEL SECURITY;

--
-- Name: rush_time_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rush_time_slots" ENABLE ROW LEVEL SECURITY;

--
-- Name: screening_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."screening_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_screenings service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'daily_screenings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."daily_screenings" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: elimination_records service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'elimination_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."elimination_records" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_splits service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'order_splits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."order_splits" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: screening_records service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'screening_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."screening_records" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'system_configs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."system_configs" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: team_splits service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'team_splits'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."team_splits" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_assessments service_role_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_all'
      AND n.nspname = 'public'
      AND c.relname = 'user_assessments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_all" ON "public"."user_assessments" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: system_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."system_configs" ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: team_splits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."team_splits" ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."transfer_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: rush_early_access user read own rush access; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user read own rush access'
      AND n.nspname = 'public'
      AND c.relname = 'rush_early_access'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user read own rush access" ON "public"."rush_early_access" FOR SELECT USING (("user_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."id" = "rush_early_access"."user_id")
 LIMIT 1)));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_addresses" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_assessments" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_rewards user_view_own_referral_rewards; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_view_own_referral_rewards'
      AND n.nspname = 'public'
      AND c.relname = 'referral_rewards'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_view_own_referral_rewards" ON "public"."referral_rewards" FOR SELECT TO "authenticated" USING (("recipient_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: kyc_applications users_insert_kyc; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users_insert_kyc'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users_insert_kyc" ON "public"."kyc_applications" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: kyc_applications users_select_own_kyc; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users_select_own_kyc'
      AND n.nspname = 'public'
      AND c.relname = 'kyc_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users_select_own_kyc" ON "public"."kyc_applications" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: virtual_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."virtual_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: voucher_pool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."voucher_pool" ENABLE ROW LEVEL SECURITY;

--
-- Name: withdrawal_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."withdrawal_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: withdrawal_review_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."withdrawal_review_logs" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- policy: "Anyone can upload id-cards" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Anyone can upload id-cards'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can upload id-cards" ON storage.objects AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((bucket_id = ''id-cards''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "Users can read own id-cards" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Users can read own id-cards'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can read own id-cards" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = ''id-cards''::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));';
  END IF;
END
$pg_schema_restore$;
-- policy: "authenticated can update avatars" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can update avatars'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated can update avatars" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((bucket_id = ''avatars''::text)) WITH CHECK ((bucket_id = ''avatars''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "authenticated can upload avatars" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can upload avatars'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated can upload avatars" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''avatars''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "public can read avatars" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public can read avatars'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "public can read avatars" ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((bucket_id = ''avatars''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "公开读取支付凭证" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '公开读取支付凭证'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "公开读取支付凭证" ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((bucket_id = ''payment-vouchers''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "用户可上传支付凭证" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可上传支付凭证'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "用户可上传支付凭证" ON storage.objects AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((bucket_id = ''payment-vouchers''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: allow_read_id_card on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_read_id_card'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY allow_read_id_card ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''id-card-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: allow_update_id_card on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_update_id_card'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY allow_update_id_card ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((bucket_id = ''id-card-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: allow_upload_id_card on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_upload_id_card'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY allow_upload_id_card ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''id-card-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: banners_all_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'banners_all_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY banners_all_delete ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING ((bucket_id = ''banners''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: banners_all_update on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'banners_all_update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY banners_all_update ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((bucket_id = ''banners''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: banners_all_write on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'banners_all_write'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY banners_all_write ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''banners''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: banners_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'banners_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY banners_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''banners''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: exchange_images_admin_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_images_admin_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY exchange_images_admin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING ((bucket_id = ''exchange-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: exchange_images_admin_upload on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_images_admin_upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY exchange_images_admin_upload ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''exchange-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: exchange_images_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exchange_images_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY exchange_images_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''exchange-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: exports_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exports_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY exports_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''exports''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: exports_public_upload on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'exports_public_upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY exports_public_upload ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''exports''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: product_images_public_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'product_images_public_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY product_images_public_delete ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING ((bucket_id = ''product-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: product_images_public_read on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'product_images_public_read'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY product_images_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''product-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: product_images_public_upload on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'product_images_public_upload'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY product_images_public_upload ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''product-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.orders
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.orders')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.rush_time_slots
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.rush_time_slots')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rush_time_slots;';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('avatars', 'avatars', NULL, '2026-08-15 03:06:10.567605+00', '2026-08-15 03:06:10.567605+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('banners', 'banners', NULL, '2026-06-27 06:55:51.364506+00', '2026-06-27 06:55:51.364506+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp,image/gif,image/avif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('exchange-images', 'exchange-images', NULL, '2026-06-26 08:13:58.863647+00', '2026-06-26 08:13:58.863647+00', 'true', 'false', '1048576', '{image/jpeg,image/png,image/webp,image/gif,image/avif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('exports', 'exports', NULL, '2026-06-23 14:15:00.428081+00', '2026-06-23 14:15:00.428081+00', 'true', 'false', '52428800', '{application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('id-card-images', 'id-card-images', NULL, '2026-06-27 05:15:49.676924+00', '2026-06-27 05:15:49.676924+00', 'true', 'false', '5242880', '{image/jpeg,image/jpg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('id-cards', 'id-cards', NULL, '2026-07-11 09:35:02.123073+00', '2026-07-11 09:35:02.123073+00', 'false', 'false', '1048576', '{image/jpeg,image/png,image/webp,image/gif,image/avif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('payment-vouchers', 'payment-vouchers', NULL, '2026-06-28 08:37:06.053249+00', '2026-06-28 08:37:06.053249+00', 'true', 'false', '10485760', '{image/jpeg,image/png,image/webp,image/gif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('product-images', 'product-images', NULL, '2026-06-23 14:15:00.428081+00', '2026-06-23 14:15:00.428081+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp,image/gif,image/avif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";

-- ============================================================
-- SECTION: CRON JOBS
-- ============================================================
-- 用户自定义 pg_cron 任务。

