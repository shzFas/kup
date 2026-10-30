# kup

Доска объявлений: автомобили, мотоциклы, мопеды/скутеры, квартиры — с фильтрацией по любым характеристикам.
Полностью self-hosted: ни один компонент не обращается к сторонним сервисам.

- Спецификация продукта — [SPEC.md](SPEC.md)
- Контракт API — [docs/API.md](docs/API.md)

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d --build                      # backend + web
cd backend && go run ./services/seed -n 240       # демо-данные (нужен OTP_DEV_MODE=true)
```

| Что | Адрес |
|---|---|
| Сайт | http://localhost:3180 |
| API (gateway) | http://localhost:8180 |
| Мобильное приложение | `cd apps/mobile && npm install && npm start` (см. [apps/mobile/README.md](apps/mobile/README.md)) |

Вход по номеру телефона: в dev-режиме SMS не отправляется, код приходит в ответе API и подставляется в форму автоматически.

## Архитектура

```
 web (Next.js) ─┐
 mobile (Expo) ─┴─► gateway :8180 ──► auth      ── PostgreSQL (kup_auth)
                    JWT, rate limit    catalog   (схемы категорий, справочники — в бинаре)
                    CORS, /media/*     listings  ── PostgreSQL (kup_listings) ── SeaweedFS (фото, S3)
                                         │ outbox
                                         ▼
                                       NATS JetStream ──► search ── Meilisearch
```

| Сервис | Отвечает за |
|---|---|
| `gateway` | Единственная точка входа. Проверяет JWT и передаёт сервисам `X-User-ID`, лимитирует запросы по IP, проксирует `/media/*` в хранилище |
| `auth` | Вход по телефону + OTP, access JWT (15 мин) и refresh-токены с ротацией и детекцией повторного использования, профиль |
| `catalog` | Категории, схемы атрибутов и фильтров, справочники (марки/модели, города) |
| `listings` | Объявления: валидация по схеме, вычисляемые поля, фото (EXIF-поворот, очистка метаданных, ресайз), избранное. Изменения уходят в NATS через transactional outbox |
| `search` | Индексирует события в Meilisearch, поиск с фильтрами, сортировками и фасетами (фасет поля считается без фильтра по этому же полю). При пустом индексе сам пересобирает его из listings |

Каждый сервис владеет своими данными (отдельная БД и роль). Внутренняя сеть docker — `internal: true`: у контейнеров нет выхода в интернет; наружу открыты только gateway и web.

### Как добавить фильтр или категорию
Отредактировать JSON в `backend/services/catalog/data/` и пересобрать `catalog` и `search` (search перечитает схемы и обновит настройки индекса). Web и mobile строят формы и фильтры из схемы — менять клиентов не нужно.

## Структура

```
backend/            Go, один модуль: pkg/ — общий код, services/<name>/ — сервисы
apps/web/           Next.js (App Router, SSR), pnpm workspace
apps/mobile/        Expo / React Native, отдельный npm-проект
packages/shared/    TS: типы API, клиент, фильтры ↔ URL (используют web и mobile)
deploy/             init-скрипты Postgres и SeaweedFS
```

## Тесты

```bash
cd backend && go test ./...
cd packages/shared && npm test
pnpm --filter @kup/web typecheck
cd apps/mobile && npx tsc --noEmit
```

## Нагрузка (~10 000 пользователей в день)

Это ~0,1–0,5 RPS в среднем и до 10–30 RPS в пике. Текущей конфигурации с одним экземпляром каждого сервиса хватает с большим запасом: поиск на демо-данных отвечает за ~3 мс (p50) / ~5 мс (p95) через gateway. Весь стек укладывается в ~4 ГБ RAM (лимиты заданы в `docker-compose.yml`), то есть в один сервер 4 vCPU / 8 ГБ.

Масштабирование, когда понадобится: stateless-сервисы (gateway, catalog, search, auth) — просто добавить реплики; rate limit gateway перенести в общий store; listings масштабируется так же (relay outbox безопасен благодаря `SKIP LOCKED` и дедупликации JetStream).

## Перед продакшеном

- Сменить все секреты в `.env`, выставить `OTP_DEV_MODE=false`.
- **Подключить отправку SMS** (`SMSSender` в `backend/services/auth`). Это единственная внешняя зависимость, без которой не обойтись: нужен свой SMS-шлюз/GSM-модем или договор с оператором напрямую.
- TLS на внешнем балансировщике, `TRUST_PROXY=true` для gateway только за ним, `CORS_ORIGINS` — домен сайта.
- Бэкапы томов `pgdata` и `s3data` (индекс Meilisearch восстанавливается сам).
