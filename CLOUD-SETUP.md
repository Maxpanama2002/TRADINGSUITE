# 🌥 Cloud Sync — пошаговая настройка

Trading Suite поддерживает синхронизацию данных между устройствами через **Supabase** (бесплатный
Postgres + Auth). Это альтернатива iCloud — работает и на Windows, и в браузерной версии.

**Время на всё:** ~15 минут.
**Статус кода:** v2.1.133 — реальная реализация поверх REST API (без external SDK).

---

## 📋 Что понадобится

- Аккаунт на [supabase.com](https://supabase.com) (бесплатно)
- (опционально) Аккаунт на [stripe.com](https://stripe.com) — для платных подписок

---

## Шаг 1. Создать проект в Supabase

1. Зайди на https://supabase.com/dashboard
2. **New project** → выбери организацию
3. **Project name:** `trading-suite` (любое)
4. **Database password:** сгенерируй сильный, сохрани в менеджере паролей
5. **Region:** выбери ближайший (для RU — `Frankfurt` или `Stockholm`)
6. **Pricing plan:** **Free** (500 МБ Postgres, 2 ГБ bandwidth, 50K MAU — этого хватит надолго)
7. Жми **Create new project**, ждём ~2 минуты пока поднимется

---

## Шаг 2. Применить SQL схему

1. В Supabase dashboard слева → **SQL Editor**
2. **New query**
3. Открой файл `db/supabase-schema.sql` из этого репо, скопируй всё содержимое
4. Вставь в SQL Editor → нажми **Run** (или Cmd+Enter)
5. Должно появиться `Success. No rows returned.`

Что создаётся:
- `public.profiles` — профили пользователей (привязка к `auth.users`)
- `public.subscriptions` — статус подписки (Stripe)
- `public.user_data` — универсальное JSON-хранилище (для всех `localStorage` ключей)
- Row Level Security включён везде — каждый юзер видит только свои данные

---

## Шаг 3. Скопировать creds в Trading Suite

1. В Supabase: **Project Settings** (шестерёнка слева внизу) → **API**
2. Скопируй:
   - **Project URL** — `https://xxxxx.supabase.co`
   - **anon public** key — длинная строка `eyJhbGci...`
3. Открой Trading Suite → клик по имени в сайдбаре → **Личный кабинет**
4. Прокрути вниз до **Быстрые настройки**
5. Вкладка **🌥 Облако**
6. Вставь URL и anon key → **Подключить**

Готово, app связан с твоим Supabase.

---

## Шаг 4. Создать аккаунт

1. В той же панели «🌥 Облако» появится секция **👤 Аккаунт**
2. Введи email и пароль (мин. 8 символов)
3. **Регистрация**
4. Если в Supabase включена email confirmation (по умолчанию) — проверь почту,
   подтверди через ссылку, потом вернись и нажми **Войти**

> **Опция:** Отключить email confirmation в Supabase Dashboard → Authentication → Providers →
> Email → выключи «Confirm email». Тогда регистрация = моментальный вход.

---

## Шаг 5. Первая синхронизация

1. После входа появятся 2 кнопки:
   - **☁️↑ Загрузить всё в облако** — отправляет все локальные данные (сделки, дневник, портфель,
     эмоции, цели, watchlist, paper-trading и т.д.) в Postgres
   - **☁️↓ Скачать из облака** — заменяет локальные данные облачными (с подтверждением)
2. На главном устройстве нажми **Загрузить в облако** (займёт ~10-30 секунд в зависимости от объёма)
3. На втором устройстве (после подключения и входа) нажми **Скачать из облака** → перезагрузка

---

## 🔒 Что синкается, что нет

**Синкается** (см. `STORAGE_KEYS.syncable` в `app/index.html`):
- Профиль, цели, правила, ачивки, уведомления
- Портфель, архив операций, capital snapshots
- Журнал сделок, архив, периоды
- Watchlist, недельный план, дневник, психо-журнал
- Стратегия, ошибки, риск-менеджер
- AI-чаты, кастомные промпты, настройки модели
- Язык, тема, таймзона

**НЕ синкается** (только локально):
- `_lr_page`, `_lr_tool` — последняя страница (per-device)
- `fng_cache`, `pf_logos_v*` — внешние API кэши с TTL
- `cloud_session_v1`, `cloud_config_v1` — сами cloud creds
- iCloud legacy ключи

---

## 🛡 Безопасность

- **Anon key — public.** Можно класть в публичный код. Защита через RLS — каждый юзер
  видит только свои строки в `user_data`.
- **service_role key — НЕ давай клиенту.** Его место только в Edge Functions (Stripe webhook).
- **TLS** — всё через HTTPS.
- **Пароли** хранит Supabase Auth (bcrypt). Trading Suite не видит plaintext.

---

## 💳 Шаг 6 (опционально). Подписки через Stripe

Когда захочешь монетизировать:

1. Создай аккаунт на https://stripe.com
2. **Products** → создай **Trading Suite Pro** (например $9.99/мес)
3. Скопируй **price_id** (вид `price_1Abc...`)
4. В Supabase создай **Edge Function** `stripe-checkout`:
   ```bash
   supabase functions new stripe-checkout
   supabase functions deploy stripe-checkout
   ```
5. Добавь Stripe webhook → Supabase Edge Function `stripe-webhook`:
   - Events: `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded`
6. В Trading Suite кнопка **«Активировать Pro»** уже есть — подключим к `CloudSync.stripe.checkout(priceId)` когда Edge Functions будут готовы.

> Этот шаг пока в `TODO` — заглушка `stripe.checkout` возвращает «not configured».

---

## ❓ Troubleshooting

**«Не удалось подключиться»** при вводе URL+key
- Проверь URL без `/` в конце
- Проверь что скопировал именно **anon public** key, а не service_role
- Открой Supabase Dashboard → Logs → API → посмотри ошибку

**«Email not confirmed»** при входе
- Проверь почту (включая спам)
- Или отключи email confirmation (см. выше)

**«row violates row-level security policy»**
- SQL миграция не применена или применена частично. Перезапусти полностью.

**Все данные пропали после Sync Down**
- Это ожидаемо — `Sync Down` перезаписывает локальное облачным. Если на втором устройстве
  ещё не было загрузки в облако — оно пустое. Сначала всегда **Sync Up** с главного.

---

## 📚 Архитектурные заметки

- **Last-write-wins** конфликт-резолюция через `updated_at`. Если открыты два устройства
  одновременно — последний save переписывает.
- **Realtime sync** (через WebSocket) — пока stub, реализуется через `wss://*.supabase.co/realtime/v1`.
  Добавится в следующей итерации.
- **REST API** напрямую, без SDK — меньше зависимостей, прозрачнее аудит, всё на нативном `fetch`.
- **Refresh token** автоматический — токены живут 1 час, перед истечением (за 60с) обновляются прозрачно.
