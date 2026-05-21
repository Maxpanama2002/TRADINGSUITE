-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 001: Admin role + admin views
-- ════════════════════════════════════════════════════════════════════════════
-- Применить:
--   Supabase Dashboard → SQL Editor → New query → вставить → Run
--
-- Что делает:
--   1. Добавляет колонку role в profiles ('user' | 'admin')
--   2. Назначает maximgorskyi@gmail.com админом
--   3. Создаёт is_admin() helper-функцию
--   4. Добавляет RLS-политики: админ читает всё
--   5. Создаёт view admin_users_view со сводной инфой по всем юзерам
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Колонка role ──
alter table public.profiles
  add column if not exists role text not null default 'user';

-- Constraint: только user или admin
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user','admin'));
  end if;
end $$;


-- ── 2. Сделать тебя админом ──
-- Если профиль ещё не создан — создаём его
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'maximgorskyi@gmail.com'
on conflict (id) do update set role = 'admin';


-- ── 3. Helper-функция is_admin() ──
-- Используется в RLS-политиках чтобы не делать SELECT в каждом WHERE
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ── 4. RLS-политики: админ читает всё ──

-- profiles: admin reads all
drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- profiles: admin updates any (для смены роли, ban и т.д.)
drop policy if exists "Admins update any profile" on public.profiles;
create policy "Admins update any profile"
  on public.profiles for update
  using (public.is_admin());

-- subscriptions: admin reads all
drop policy if exists "Admins read all subscriptions" on public.subscriptions;
create policy "Admins read all subscriptions"
  on public.subscriptions for select
  using (public.is_admin());

-- subscriptions: admin updates (grant pro / cancel etc.)
drop policy if exists "Admins update subscriptions" on public.subscriptions;
create policy "Admins update subscriptions"
  on public.subscriptions for update
  using (public.is_admin());

drop policy if exists "Admins insert subscriptions" on public.subscriptions;
create policy "Admins insert subscriptions"
  on public.subscriptions for insert
  with check (public.is_admin());

-- user_data: admin reads all (для отладки и поддержки)
drop policy if exists "Admins read all user_data" on public.user_data;
create policy "Admins read all user_data"
  on public.user_data for select
  using (public.is_admin());


-- ── 5. View с информацией о всех пользователях ──
-- Объединяет auth.users + profiles + subscriptions в одну таблицу для админки
create or replace view public.admin_users_view as
select
  u.id                                  as user_id,
  u.email                               as email,
  u.created_at                          as signup_at,
  u.last_sign_in_at                     as last_sign_in,
  u.email_confirmed_at                  as email_confirmed_at,
  coalesce(p.display_name, '')          as display_name,
  coalesce(p.role, 'user')              as role,
  coalesce(p.trading_style, '')         as trading_style,
  coalesce(s.plan, 'free')              as plan,
  coalesce(s.status, 'active')          as status,
  s.current_period_end                  as period_end,
  s.cancel_at_period_end                as cancel_at_period_end,
  s.stripe_customer_id                  as stripe_customer_id,
  -- Storage stats
  (select count(*) from public.user_data ud where ud.user_id = u.id) as data_rows
from auth.users u
left join public.profiles p      on p.id = u.id
left join public.subscriptions s on s.user_id = u.id;

-- Доступ к view только для админов (через security_invoker — view используется
-- с правами читающего, а у обычных юзеров нет SELECT на auth.users)
alter view public.admin_users_view set (security_invoker = on);

grant select on public.admin_users_view to authenticated;


-- ── 6. Дополнительный grant: админ может читать auth.users напрямую ──
-- Это нужно для view выше. По умолчанию auth.users закрыта от authenticated.
-- Создаём отдельный SECURITY DEFINER-RPC чтобы админ мог получить список:
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  signup_at timestamptz,
  last_sign_in timestamptz,
  email_confirmed_at timestamptz,
  display_name text,
  role text,
  trading_style text,
  plan text,
  status text,
  period_end timestamptz,
  cancel_at_period_end boolean,
  stripe_customer_id text,
  data_rows bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  return query
  select
    u.id                                  as user_id,
    u.email::text                         as email,
    u.created_at                          as signup_at,
    u.last_sign_in_at                     as last_sign_in,
    u.email_confirmed_at                  as email_confirmed_at,
    coalesce(p.display_name, '')          as display_name,
    coalesce(p.role, 'user')              as role,
    coalesce(p.trading_style, '')         as trading_style,
    coalesce(s.plan, 'free')              as plan,
    coalesce(s.status, 'active')          as status,
    s.current_period_end                  as period_end,
    s.cancel_at_period_end                as cancel_at_period_end,
    s.stripe_customer_id                  as stripe_customer_id,
    (select count(*) from public.user_data ud where ud.user_id = u.id) as data_rows
  from auth.users u
  left join public.profiles p      on p.id = u.id
  left join public.subscriptions s on s.user_id = u.id
  order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;


-- ── 7. Сводная статистика для дашборда админки ──
create or replace function public.admin_stats()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  select json_build_object(
    'total_users',         (select count(*) from auth.users),
    'confirmed_users',     (select count(*) from auth.users where email_confirmed_at is not null),
    'new_today',           (select count(*) from auth.users where created_at >= now() - interval '24 hours'),
    'new_week',            (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'active_today',        (select count(*) from auth.users where last_sign_in_at >= now() - interval '24 hours'),
    'active_week',         (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'pro_users',           (select count(*) from public.subscriptions where plan = 'pro' and status = 'active'),
    'free_users',          (select count(*) from auth.users) -
                           (select count(*) from public.subscriptions where plan = 'pro' and status = 'active'),
    'admins_count',        (select count(*) from public.profiles where role = 'admin')
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_stats() to authenticated;
