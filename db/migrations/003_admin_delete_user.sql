-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 003: Admin can fully delete a user
-- ════════════════════════════════════════════════════════════════════════════
-- Запусти в: Supabase Dashboard → SQL Editor → New query → Run
--
-- Что делает:
--   admin_delete_user(uuid) — полностью удаляет пользователя.
--   Каскадом удалятся: profiles, subscriptions, user_data, user_events
--   (благодаря "on delete cascade" в FK constraints).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.admin_delete_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- 1. Только админ может вызвать
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  -- 2. Защита: нельзя удалить самого себя
  if target_user_id = auth.uid() then
    raise exception 'Cannot delete yourself. Ask another admin to do this.';
  end if;

  -- 3. Удаление из auth.users → cascade удалит всё связанное
  --    (profiles, subscriptions, user_data, user_events, auth.identities)
  delete from auth.users where id = target_user_id;

  return true;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
