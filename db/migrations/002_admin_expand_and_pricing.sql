-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 002: Admin expansion + pricing config + events log
-- ════════════════════════════════════════════════════════════════════════════
-- Запусти в: Supabase Dashboard → SQL Editor → New query → Run
--
-- Что делает:
--   1. app_config — глобальная конфигурация (цены Pro, фича-флаги)
--   2. user_events — журнал ключевых действий пользователей
--   3. profiles.banned_at, profiles.ban_reason
--   4. Helper-функции для админки: admin_signups_by_day, admin_ban_user,
--      admin_unban_user, admin_user_detail
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. App config (key-value) ──────────────────────────────────────────────
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.app_config enable row level security;

-- Anyone can read public config (e.g. pricing)
drop policy if exists "Public read app_config" on public.app_config;
create policy "Public read app_config"
  on public.app_config for select
  to authenticated, anon
  using (true);

-- Only admins can write
drop policy if exists "Admins write app_config" on public.app_config;
create policy "Admins write app_config"
  on public.app_config for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed default pricing config (only if not exists)
insert into public.app_config (key, value, description) values
  ('pricing.pro_monthly', '{"amount": 9.99, "currency": "USD", "stripe_price_id": ""}'::jsonb, 'Цена Pro подписки в месяц'),
  ('pricing.pro_yearly',  '{"amount": 89.99, "currency": "USD", "stripe_price_id": ""}'::jsonb, 'Цена Pro подписки в год (со скидкой)'),
  ('features.ai_enabled',  'true'::jsonb,  'AI-ассистент включён'),
  ('features.pro_required_for_ai', 'true'::jsonb, 'AI только для Pro подписчиков'),
  ('features.pro_required_for_export', 'false'::jsonb, 'Экспорт данных только для Pro')
on conflict (key) do nothing;


-- ── 2. User events log ─────────────────────────────────────────────────────
create table if not exists public.user_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  event      text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_events_user on public.user_events(user_id);
create index if not exists idx_user_events_created on public.user_events(created_at desc);
create index if not exists idx_user_events_event on public.user_events(event);

alter table public.user_events enable row level security;

drop policy if exists "Users insert own events" on public.user_events;
create policy "Users insert own events"
  on public.user_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users read own events" on public.user_events;
create policy "Users read own events"
  on public.user_events for select
  using (auth.uid() = user_id);

drop policy if exists "Admins read all events" on public.user_events;
create policy "Admins read all events"
  on public.user_events for select
  using (public.is_admin());


-- ── 3. Ban support on profiles ─────────────────────────────────────────────
alter table public.profiles add column if not exists banned_at  timestamptz;
alter table public.profiles add column if not exists ban_reason text;


-- ── 4. Signups chart RPC ───────────────────────────────────────────────────
-- Returns: list of {day, count} for last N days
create or replace function public.admin_signups_by_day(days_back int default 30)
returns table (day date, count bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  return query
  select d::date as day, coalesce(c, 0) as count
  from generate_series(
    (now() - (days_back||' days')::interval)::date,
    now()::date,
    interval '1 day'
  ) d
  left join (
    select date_trunc('day', created_at)::date as day, count(*) as c
    from auth.users
    where created_at >= now() - (days_back||' days')::interval
    group by 1
  ) s on s.day = d::date
  order by d;
end;
$$;
grant execute on function public.admin_signups_by_day(int) to authenticated;


-- ── 5. Ban / Unban user RPCs ───────────────────────────────────────────────
create or replace function public.admin_ban_user(target_user_id uuid, reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  if target_user_id = auth.uid() then raise exception 'Cannot ban yourself'; end if;

  -- Mark in profiles
  insert into public.profiles (id, banned_at, ban_reason)
  values (target_user_id, now(), reason)
  on conflict (id) do update set banned_at = now(), ban_reason = reason;

  -- Also set banned_until in auth.users (blocks login at GoTrue level)
  update auth.users set banned_until = 'infinity'::timestamptz where id = target_user_id;

  return true;
end;
$$;
grant execute on function public.admin_ban_user(uuid, text) to authenticated;

create or replace function public.admin_unban_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;

  update public.profiles set banned_at = null, ban_reason = null where id = target_user_id;
  update auth.users set banned_until = null where id = target_user_id;
  return true;
end;
$$;
grant execute on function public.admin_unban_user(uuid) to authenticated;


-- ── 6. Update admin_list_users to include ban info ─────────────────────────
create or replace function public.admin_list_users()
returns table (
  user_id uuid, email text, signup_at timestamptz, last_sign_in timestamptz,
  email_confirmed_at timestamptz, display_name text, role text, trading_style text,
  plan text, status text, period_end timestamptz, cancel_at_period_end boolean,
  stripe_customer_id text, data_rows bigint, banned_at timestamptz, ban_reason text
)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    coalesce(p.display_name,''), coalesce(p.role,'user'), coalesce(p.trading_style,''),
    coalesce(s.plan,'free'), coalesce(s.status,'active'),
    s.current_period_end, s.cancel_at_period_end, s.stripe_customer_id,
    (select count(*) from public.user_data ud where ud.user_id = u.id),
    p.banned_at, p.ban_reason
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscriptions s on s.user_id = u.id
  order by u.created_at desc;
end; $$;
grant execute on function public.admin_list_users() to authenticated;


-- ── 7. User detail (with recent events) ────────────────────────────────────
create or replace function public.admin_user_detail(target_user_id uuid)
returns json
language plpgsql security definer set search_path = public, auth as $$
declare result json;
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  select json_build_object(
    'user',     (select row_to_json(u) from (
      select id, email, created_at, last_sign_in_at, email_confirmed_at, raw_user_meta_data
      from auth.users where id = target_user_id
    ) u),
    'profile',  (select row_to_json(p) from public.profiles p where p.id = target_user_id),
    'subscription', (select row_to_json(s) from public.subscriptions s where s.user_id = target_user_id),
    'events',   (select coalesce(json_agg(e order by created_at desc), '[]'::json) from (
      select event, payload, created_at
      from public.user_events
      where user_id = target_user_id
      order by created_at desc
      limit 50
    ) e),
    'data_keys', (select coalesce(json_agg(json_build_object('key', key, 'updated_at', updated_at) order by updated_at desc), '[]'::json)
                  from public.user_data where user_id = target_user_id)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_user_detail(uuid) to authenticated;


-- ── 8. Recent events feed for admin ────────────────────────────────────────
create or replace function public.admin_recent_events(limit_n int default 100)
returns table (id bigint, user_id uuid, user_email text, event text, payload jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Access denied: admin only'; end if;
  return query
  select e.id, e.user_id, u.email::text, e.event, e.payload, e.created_at
  from public.user_events e
  left join auth.users u on u.id = e.user_id
  order by e.created_at desc
  limit limit_n;
end; $$;
grant execute on function public.admin_recent_events(int) to authenticated;
