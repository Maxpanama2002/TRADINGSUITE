-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 006: LemonSqueezy fields on subscriptions + pricing config keys
-- ════════════════════════════════════════════════════════════════════════════
-- Switch from Stripe to LemonSqueezy. Adds LS-specific columns to keep both
-- providers possible (in case we ever come back to Stripe), but the LS columns
-- are what the new code uses.
--
-- Запусти в Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. New LS columns ──────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists lemonsqueezy_customer_id     text,
  add column if not exists lemonsqueezy_subscription_id text,
  add column if not exists lemonsqueezy_order_id        text,
  add column if not exists lemonsqueezy_product_id      text,
  add column if not exists lemonsqueezy_variant_id      text,
  add column if not exists lemonsqueezy_status          text,
  add column if not exists renews_at                    timestamptz,
  add column if not exists ends_at                      timestamptz;

create index if not exists idx_subs_ls_customer
  on public.subscriptions(lemonsqueezy_customer_id);

create index if not exists idx_subs_ls_subscription
  on public.subscriptions(lemonsqueezy_subscription_id);


-- ── 2. Seed pricing keys for LS ────────────────────────────────────────────
-- Old Stripe keys stay (so we don't break anything), new LS keys added.
insert into public.app_config (key, value, description) values
  ('pricing.pro_monthly_ls', '{"amount": 9.99, "currency": "USD", "store_id": "", "variant_id": "", "checkout_url": ""}'::jsonb,
   'LemonSqueezy: Pro monthly — store_id, variant_id, full checkout URL'),
  ('pricing.pro_yearly_ls',  '{"amount": 89.99, "currency": "USD", "store_id": "", "variant_id": "", "checkout_url": ""}'::jsonb,
   'LemonSqueezy: Pro yearly')
on conflict (key) do nothing;


-- ── 3. RPC for admin: full subscription detail by LS subscription ID ──────
-- Used by webhook handler (via service role) and for admin debugging
create or replace function public.admin_lookup_user_by_ls_customer(p_customer_id text)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  return query
  select s.user_id, u.email::text
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  where s.lemonsqueezy_customer_id = p_customer_id
  limit 1;
end;
$$;
grant execute on function public.admin_lookup_user_by_ls_customer(text) to authenticated;

notify pgrst, 'reload schema';
