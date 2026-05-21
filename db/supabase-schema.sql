-- ════════════════════════════════════════════════════════════════════════════
-- Trading Suite — Supabase database schema
-- ════════════════════════════════════════════════════════════════════════════
-- Применить:
--   1. Зайти в Supabase Dashboard → SQL Editor
--   2. Скопировать содержимое этого файла, вставить, нажать "Run"
--   3. Готово, все таблицы созданы, RLS включён
--
-- Принципы:
--   • Одна строка в Postgres = один объект из localStorage (JSON blob)
--   • Это позволяет не переписывать клиентский код массово; обёртка просто
--     перехватывает get/set/remove и зеркалит в облако
--   • Row Level Security (RLS) обязателен: пользователь читает/пишет только свои
--     записи (where user_id = auth.uid())
--   • updated_at — для последующего conflict resolution (last-write-wins)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Профили пользователей (расширение auth.users) ──
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  display_name    text,
  avatar_url      text,
  bio             text,
  trading_style   text,                                              -- 'scalper'|'daytrader'|'swing'|'positional'|'investor'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);


-- ── 1. Подписки (Stripe) ──
create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  plan                 text not null default 'free',                 -- 'free' | 'pro'
  status               text not null default 'active',               -- 'active' | 'past_due' | 'canceled' | 'trialing'
  stripe_customer_id   text,
  stripe_subscription_id text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);
-- Запись — только сервером (Stripe webhook через service_role)


-- ── 2. Универсальное key-value хранилище (для всех localStorage сущностей) ──
-- Зачем jsonb-blob, а не отдельная таблица на каждый тип:
--   • Текущие сущности в localStorage — все уже JSON (portfolio, trades, diary…)
--   • Миграция клиентского кода без переписывания структур
--   • Один SELECT забирает всё нужное при старте сессии
--   • Поиск по содержимому при необходимости — через jsonb-операторы

create table if not exists public.user_data (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idx_user_data_user on public.user_data(user_id);
create index if not exists idx_user_data_updated on public.user_data(updated_at);

alter table public.user_data enable row level security;

create policy "Users read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users update own data"
  on public.user_data for update
  using (auth.uid() = user_id);

create policy "Users delete own data"
  on public.user_data for delete
  using (auth.uid() = user_id);


-- ── 3. Trigger: автоматическое обновление updated_at ──
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();


-- ── 4. Trigger: создавать строку в profiles + subscriptions при регистрации ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.subscriptions (user_id, plan)
  values (new.id, 'free');

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── 5. Полезные функции ──
-- Возвращает план пользователя (для проверок на клиенте/в edge functions)
create or replace function public.get_user_plan(uid uuid default auth.uid())
returns text
language sql
stable
as $$
  select coalesce(plan, 'free') from public.subscriptions where user_id = uid limit 1;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- Список ключей localStorage, которые синхронизируются (для справки):
--   user_profile, user_plan, user_goals_v1, user_rules_v1,
--   user_achievements_seen_v1, user_notifications_v1,
--   portfolio_v1, portfolio_archive_v1, capital_snapshots_v1,
--   tj_v3, tj_archive_v3, tj_periods,
--   watchlist_v1, weekplan_v1, tp_plans_v1,
--   diary_v1, psy_v1, psycho_v1,
--   gc_v1, dashboard_config_v1, sb_sections,
--   myday_blocks_*, myday_goals_*, myday_mgoals_* (per-date keys),
--   rm_daily_*, rm_settings,
--   strategy_cfg_v1, strategy_errors_v1, strategy_rules_v1, rt_rules_v1,
--   ai_chats_v1, ai_ctx_v1, ai_custom_prompt_v1, ai_model_v1, ai_preset_v1,
--   app_lang, app_theme, app_tz, dv_funding_period
--
-- Не синкаются (только локально):
--   _lr_page, _lr_tool (last route — per-device)
--   fng_cache, pf_logos_v* (внешние данные с TTL)
--   icloud_auto, icloud_pw_enabled (legacy iCloud sync)
-- ════════════════════════════════════════════════════════════════════════════
