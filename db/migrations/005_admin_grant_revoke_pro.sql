-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 005: Reliable admin_grant_pro / admin_revoke_pro RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- Зачем: предыдущая логика (PATCH → fallback INSERT) ломалась когда строки в
-- public.subscriptions не было — две сетевые поездки и иногда RLS отбивал INSERT.
-- Эти RPC выполняют UPSERT за один запрос с правами админа (SECURITY DEFINER).
--
-- Запусти: Supabase Dashboard → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ── Выдать Pro (опционально на N дней) ──────────────────────────────────────
create or replace function public.admin_grant_pro(
  target_user_id uuid,
  duration_days  int default null  -- null = forever; иначе current_period_end = now() + N days
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_period_end timestamptz;
  v_result     json;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  if duration_days is null then
    v_period_end := null;
  else
    v_period_end := now() + (duration_days || ' days')::interval;
  end if;

  insert into public.subscriptions (
    user_id, plan, status, current_period_end, cancel_at_period_end, updated_at
  ) values (
    target_user_id, 'pro', 'active', v_period_end, false, now()
  )
  on conflict (user_id) do update set
    plan = 'pro',
    status = 'active',
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = false,
    updated_at = now();

  select row_to_json(s) into v_result from public.subscriptions s where s.user_id = target_user_id;
  return v_result;
end;
$$;
grant execute on function public.admin_grant_pro(uuid, int) to authenticated;


-- ── Снять Pro (вернуть на free) ─────────────────────────────────────────────
create or replace function public.admin_revoke_pro(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  update public.subscriptions
  set plan = 'free',
      status = 'canceled',
      cancel_at_period_end = false,
      updated_at = now()
  where user_id = target_user_id;

  return true;
end;
$$;
grant execute on function public.admin_revoke_pro(uuid) to authenticated;
