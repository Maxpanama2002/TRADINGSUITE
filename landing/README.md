# Trading Suite — Сайт

Многостраничный статический сайт. 6 страниц + общая CSS.

## Структура

```
landing/
├── index.html              Главная — hero + features preview + how it works
├── features.html           Полный разбор всех модулей
├── download.html           Скачивание + установка + FAQ
├── docs.html               Документация (10 разделов с TOC)
├── changelog.html          История версий
├── legal/
│   ├── privacy.html        Privacy Policy
│   └── terms.html          Terms of Service
├── assets/
│   └── site.css            Общий CSS (~13 КБ)
├── favicon.svg
├── icon.png                OG-image и app icon
├── sitemap.xml
├── robots.txt
├── vercel.json
└── README.md
```

## Размеры

- `index.html` ~14 КБ
- `features.html` ~14 КБ
- `download.html` ~8 КБ
- `docs.html` ~13 КБ
- `changelog.html` ~10 КБ
- `legal/*.html` ~6 КБ каждая
- `assets/site.css` ~13 КБ (общая)

Итого первая загрузка любой страницы ~ 25-30 КБ HTML + CSS. После — кэш CSS, остальные страницы ~ 10-15 КБ каждая.

## Локальный просмотр

```bash
cd landing
python3 -m http.server 8000
# открой http://localhost:8000
```

Проверь все ссылки:
- /
- /features.html
- /download.html
- /docs.html
- /changelog.html
- /legal/privacy.html
- /legal/terms.html

## Что поменять перед публикацией

Поиск-замена по всем `*.html`:

1. **Email контакта:** `hello@example.com` → твой email
2. **GitHub репо для DMG:** `github.com/maksymgorskyi/trading-suite` → твой репо
3. **Домен в sitemap:** `trading-suite.example.com` → твой домен
4. **Версия в footer:** `2.1.133` → актуальная (или сделать через placeholder)

## Деплой

### Vercel CLI

```bash
cd landing
vercel
# проект name: trading-suite
# directory: ./
# build command: (skip)
# output directory: ./
vercel --prod
```

### Vercel UI через GitHub

1. Создай GitHub репо, push содержимое `landing/`
2. https://vercel.com/new → импортируй
3. Root Directory → `landing/` (если landing — подпапка)
4. Deploy

### Cloudflare Pages

1. https://dash.cloudflare.com → Workers & Pages → Create
2. Connect to Git → выбери репо
3. Build command: (none)
4. Build output directory: `landing` (или `/` если landing на верхнем уровне)
5. Deploy

### GitHub Pages (бесплатно)

1. В репо: Settings → Pages
2. Source: Deploy from branch
3. Branch: main, folder: `/landing`
4. Save → через 1-2 минуты будет доступно на `username.github.io/trading-suite/`

## DMG-хостинг

Если DMG > 25 МБ — не клади в Vercel (медленно). Используй **GitHub Releases**:

1. На GitHub репо → Releases → Draft new release
2. Tag `v2.1.133` · Title `Trading Suite 2.1.133`
3. Attach `dist/Trading Suite-2.1.133-arm64.dmg`
4. Publish
5. Прямая ссылка: `https://github.com/USER/REPO/releases/latest/download/Trading.Suite-2.1.133-arm64.dmg`

Обнови ссылки в `download.html` и `index.html` (поиск по `releases/latest`).

## SEO

Уже сделано:
- `<meta name="description">` на каждой странице
- `<meta property="og:*">` для соцсетей
- `sitemap.xml` + `robots.txt`
- Семантический HTML (h1, h2, nav, footer, section)
- Mobile-responsive
- Быстрая загрузка (no JS, no external fonts)

## Lighthouse-оптимизация

- **Performance:** должен быть 100. Без JS, без external requests кроме шрифтов (но они системные).
- **Accessibility:** ~95. Можно улучшить добавив `aria-label` к иконкам.
- **Best Practices:** 100.
- **SEO:** 100.
