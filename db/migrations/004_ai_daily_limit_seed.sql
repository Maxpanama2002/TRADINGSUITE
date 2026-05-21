-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: Seed default AI daily limit for Free users
-- ════════════════════════════════════════════════════════════════════════════

insert into public.app_config (key, value, description) values
  ('feature.ai_free_daily_limit', '5'::jsonb, 'Лимит AI сообщений в день для Free тарифа (0 = безлимит)')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
