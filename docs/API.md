# kup MVP — контракт API

Все клиенты ходят только в **gateway**: `http://localhost:8180` (dev).
Префикс API: `/v1`. Формат: JSON, UTF-8. Даты — RFC 3339 (UTC).
Фото отдаются gateway по пути `/media/...` (относительные URL в ответах; клиент добавляет базовый адрес).

## Общее

### Авторизация
`Authorization: Bearer <access_token>`. Access-токен живёт 15 минут, refresh — 30 дней (одноразовый, при обновлении выдаётся новая пара).
На `401` клиент один раз пробует `POST /v1/auth/refresh`, при неудаче — разлогинивает.

### Ошибки
```json
{ "error": "validation_failed", "message": "Человекочитаемое сообщение", "fields": { "year": "обязательное поле" } }
```
`fields` — опционально (ошибки валидации формы). Коды HTTP: 400, 401, 403, 404, 409, 413, 429, 500.

---

## Auth

### `POST /v1/auth/otp/request`
```json
{ "phone": "+420777123456" }
```
→ `200`
```json
{ "sent": true, "retry_after_sec": 60, "dev_code": "1234" }
```
`dev_code` присутствует только в dev-режиме (SMS не отправляется) — клиент может подставить его автоматически/показать подсказку.
Телефон: E.164, `+` и 10–15 цифр. Повторный запрос раньше `retry_after_sec` → `429`.

### `POST /v1/auth/otp/verify`
```json
{ "phone": "+420777123456", "code": "1234" }
```
→ `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "b3J...",
  "expires_in": 900,
  "user": { "id": "uuid", "phone": "+420777123456", "name": "", "role": "user", "lang": "ru", "created_at": "..." }
}
```
Неверный код → `400 {"error":"invalid_code"}`; после 5 попыток код сгорает.

### `POST /v1/auth/refresh`
`{ "refresh_token": "..." }` → такой же ответ, как у verify.

### `POST /v1/auth/logout` (auth)
`{ "refresh_token": "..." }` → `204`

### `GET /v1/me` (auth) → `user`
### `PATCH /v1/me` (auth) `{ "name": "Иван" }` → `user`

---

## Catalog

### `GET /v1/categories`
```json
{ "items": [
  { "slug": "cars",        "name": "Автомобили",       "icon": "car" },
  { "slug": "motorcycles", "name": "Мотоциклы",        "icon": "motorcycle" },
  { "slug": "mopeds",      "name": "Мопеды и скутеры", "icon": "scooter" },
  { "slug": "apartments",  "name": "Квартиры",         "icon": "apartment" }
] }
```

### `GET /v1/categories/{slug}/schema`
Ответ содержит **три списка**: `attributes` — для формы подачи, `filters` — для панели фильтров, `sorts` — варианты сортировки.

```jsonc
{
  "category": "cars",
  "name": "Автомобили",
  "groups": [ { "key": "main", "label": "Основное" }, { "key": "engine", "label": "Двигатель и трансмиссия" } ],

  "attributes": [
    {
      "key": "make",
      "type": "ref",              // int | decimal | enum | multi_enum | bool | ref | text
      "label": "Марка",
      "group": "main",
      "required": true,
      "ref": "car_make",          // только для ref
      "parent": null,             // для ref: ключ родительского атрибута (model → make)
      "options": null,            // для enum / multi_enum: [{ "value": "petrol", "label": "Бензин" }]
      "min": null, "max": null, "step": null,   // для int / decimal
      "unit": null,               // "км", "л", "м²", "л.с."...
      "depends_on": null,         // { "key": "fuel", "values": ["electric"] } — поле показывается/допустимо только если значение key ∈ values
      "computed": false           // true — вычисляется сервером, в форме НЕ показывать
    }
  ],

  "filters": [
    {
      "key": "make",
      "label": "Марка",
      "widget": "ref",            // range | multi | multi_all | toggle | select | ref
      "type": "ref",
      "group": "main",
      "ref": "car_make", "parent": null,
      "options": null,            // для multi / multi_all / select
      "min": null, "max": null, "step": null, "unit": null,
      "presets": null,            // для range: подсказки значений [50000, 100000]
      "pinned": true,             // показывать в быстрых фильтрах над выдачей
      "facet": true,              // сервер возвращает счётчики по значениям
      "depends_on": null
    }
  ],

  "sorts": [ { "value": "date_desc", "label": "Сначала новые" } ]
}
```

Фильтры `price`, `city`, `with_photo`, `posted_within` — общие для всех категорий, они уже включены в `filters` каждой схемы (в группе `common`).

### `GET /v1/refs/{ref}?parent=a,b&q=тойо`
Справочники: `city`, `car_make`, `car_model`, `moto_make`, `moto_model`, `moped_make`, `moped_model`.
`parent` — фильтр по родителю (можно несколько через запятую), `q` — поиск по названию и синонимам.
```json
{ "items": [ { "id": "toyota-camry", "name": "Camry", "parent": "toyota" } ] }
```

---

## Listings

### Объект «карточка» (`ListingCard`) — в выдаче, избранном, «моих объявлениях»
```jsonc
{
  "id": "uuid",
  "category": "cars",
  "title": "Toyota Camry, 2018",          // генерируется сервером
  "price": 12500000,                        // целое, в минимальных единицах валюты (тенге)
  "currency": "CZK",
  "price_suffix": "",                       // "" | "/мес" | "/сутки" (аренда квартир)
  "city": { "id": "praha", "name": "Прага" },
  "photos": ["/media/photos/2f1c...jpg"],   // первые до 5 фото, первое — обложка
  "attributes": { "make": "toyota", "model": "toyota-camry", "year": 2018, "mileage_km": 85000 },
  "attribute_labels": { "make": "Toyota", "model": "Camry", "year": "2018", "mileage_km": "85 000 км", "transmission": "Автомат" },
  "highlights": ["2018", "85 000 км", "2.5 л", "Автомат"],   // 3–5 главных параметров для карточки
  "status": "active",                       // active | archived | sold
  "published_at": "2026-10-30T10:00:00Z",
  "is_favorite": false                      // только если запрос с токеном
}
```

### Объект «объявление» (`Listing`) = `ListingCard` +
```jsonc
{
  "description": "...",
  "photos": [ "...все фото (большие)..." ],
  "photo_ids": [ "ph_uuid1", "ph_uuid2" ],        // id фото в том же порядке — их передавать в PATCH
  "location": { "lat": 43.238, "lng": 76.889 } ,   // или null
  "seller": { "id": "uuid", "name": "Иван", "member_since": "2026-01-01T00:00:00Z" },
  "views": 120,
  "is_owner": false,
  "updated_at": "..."
}
```

### `GET /v1/listings/{id}` → `Listing`
### `GET /v1/listings/{id}/phone` (auth) → `{ "phone": "+420777123456" }`

### `POST /v1/listings` (auth) — создать и сразу опубликовать
```json
{
  "category": "cars",
  "price": 12500000,
  "currency": "CZK",
  "city": "almaty",
  "description": "Один владелец, обслуживалась у дилера",
  "location": { "lat": 43.238, "lng": 76.889 },
  "photos": ["ph_uuid1", "ph_uuid2"],
  "attributes": { "make": "toyota", "model": "toyota-camry", "year": 2018, "mileage_km": 85000, "fuel": "petrol", "transmission": "automatic" }
}
```
→ `201 Listing`. Ошибки валидации → `400` c `fields` (ключи — `attributes.<key>` или имя поля: `price`, `city`…).
Правила: атрибуты проверяются по схеме категории; атрибуты с невыполненным `depends_on` и `computed` — игнорируются; неизвестные ключи → ошибка.

### `PATCH /v1/listings/{id}` (auth, владелец) — те же поля, все опциональны (`attributes` заменяется целиком) → `Listing`
### `POST /v1/listings/{id}/status` (auth, владелец) `{ "status": "archived" | "sold" | "active" }` → `Listing`
### `DELETE /v1/listings/{id}` (auth, владелец) → `204`

### `GET /v1/me/listings?status=active` (auth) → `{ "items": [ListingCard] }`

### Фото: `POST /v1/media/photos` (auth)
`multipart/form-data`, поле `file` (jpeg/png/webp, ≤ 10 МБ). Сервер учитывает EXIF-поворот, удаляет метаданные, ужимает до 1600 px и делает превью 480 px.
→ `201 { "id": "ph_uuid", "url": "/media/photos/ph_uuid.jpg" }`.
В карточках (`ListingCard.photos`) отдаются превью (`..._t.jpg`), в полном объявлении — большие фото.
Порядок фото в объявлении — порядок `id` в массиве `photos` (максимум 20).

### Избранное (auth)
- `GET /v1/me/favorites` → `{ "items": [ListingCard] }`
- `PUT /v1/me/favorites/{listing_id}` → `204`
- `DELETE /v1/me/favorites/{listing_id}` → `204`

---

## Search

### `POST /v1/search`
```jsonc
{
  "category": "cars",                 // обязательно
  "query": "камри",                   // опционально, полнотекст
  "filters": {
    "make":          { "in": ["toyota", "bmw"] },     // widget ref | multi
    "model":         { "in": ["toyota-camry"] },
    "year":          { "gte": 2015, "lte": 2020 },    // widget range (любая граница опциональна)
    "options":       { "all": ["abs", "heated_seats"] }, // widget multi_all
    "customs_cleared": { "eq": true },                // widget toggle
    "posted_within": { "eq": "7" },                   // widget select
    "price":         { "lte": 15000000 },
    "city":          { "in": ["almaty"] },
    "with_photo":    { "eq": true }
  },
  "geo": { "lat": 43.24, "lng": 76.89, "radius_km": 30 },   // опционально
  "sort": "price_asc",                // значение из schema.sorts; по умолчанию date_desc
  "page": 1,                          // с 1
  "limit": 30,                        // ≤ 60
  "facets": ["make", "fuel"]          // ключи фильтров с facet=true; не указано — все facet-фильтры; [] — без фасетов (для 2-й и далее страниц)
}
```
→ `200`
```jsonc
{
  "total": 1243,
  "page": 1,
  "limit": 30,
  "items": [ /* ListingCard */ ],
  "facets": { "make": { "toyota": 812, "bmw": 120 }, "fuel": { "petrol": 950 } }
}
```
Фасет по атрибуту считается **без учёта фильтра по этому же атрибуту** — при выборе «Toyota» остальные марки остаются со своими счётчиками.
Неизвестный ключ фильтра или неверный оператор → `400`.

### `POST /v1/search/count`
То же тело → `{ "total": 1243 }` (для кнопки «Показать 1 243 объявления», вызывать с debounce ~300 мс).

---

## Сериализация фильтров в URL (web и deep links)

Реализовано в `packages/shared` (`filtersToQuery`, `queryToFilters`):

| widget | в объекте | в URL |
|---|---|---|
| range | `{gte: 2015, lte: 2020}` | `year=2015..2020`, `year=2015..`, `year=..2020` |
| multi / ref | `{in: ["a","b"]}` | `make=a,b` |
| multi_all | `{all: ["a","b"]}` | `options=a,b` |
| toggle | `{eq: true}` | `customs_cleared=1` |
| select | `{eq: "7"}` | `posted_within=7` |

Служебные параметры: `q` (query), `sort`, `page`.
Пример: `/s/cars?make=toyota&year=2015..2020&transmission=automatic&sort=price_asc`.

---

# Этап 2: уведомления, чат, модерация, доработки объявлений

## Изменения в существующих объектах

- `User` получает поле `role`: `"user" | "moderator" | "admin"`. Роль попадает в JWT; gateway передаёт её сервисам.
  Админы назначаются через переменную окружения `ADMIN_PHONES` сервиса auth (через запятую).
- `ListingCard.status`: `active | archived | sold | expired | blocked`.
  `expired` — истёк срок размещения (30 дней), `blocked` — заблокировано модератором.
- `Listing` дополнительно:
```jsonc
{
  "expires_at": "2026-11-29T10:00:00Z",         // для active; продление — POST /status {"status":"active"}
  "price_history": [ { "price": 13000000, "at": "2026-10-01T10:00:00Z" }, { "price": 12500000, "at": "..." } ], // от старых к новым
  "moderation_reason": null                      // текст причины для blocked (виден только владельцу и модераторам)
}
```
- `POST /v1/listings/{id}/status`: `{"status":"active"}` для `archived`/`sold`/`expired` = продление (дата публикации и срок обновляются). Для `blocked` → `403`.
- Описание не может содержать ссылки (`http`, `www.`, `t.me/`…) → `400`, `fields.description`.

## Похожие объявления
`GET /v1/search/similar/{listing_id}?limit=8` → `{ "items": [ListingCard] }`

## Сохранённые поиски (auth)

```jsonc
// SavedSearch
{
  "id": "uuid",
  "name": "Toyota Camry от 2018",
  "request": { "category": "cars", "query": "", "filters": { "make": { "in": ["toyota"] } } }, // как в POST /v1/search (без sort/page)
  "notify": true,            // присылать уведомления о новых объявлениях
  "new_count": 3,            // непросмотренные новые объявления
  "created_at": "..."
}
```
- `GET /v1/me/saved-searches` → `{ "items": [SavedSearch] }` (до 50 на пользователя)
- `POST /v1/me/saved-searches` `{ "name": "...", "request": {...}, "notify": true }` → `201 SavedSearch`.
  `name` можно не передавать — сервер подставит название категории. Неизвестные фильтры → `400`.
- `PATCH /v1/me/saved-searches/{id}` `{ "name"?: "...", "notify"?: false }` → `SavedSearch`
- `DELETE /v1/me/saved-searches/{id}` → `204`
- `POST /v1/me/saved-searches/{id}/seen` → `204` — обнуляет `new_count` (вызывать при открытии поиска)

Клиент открывает сохранённый поиск как обычную выдачу (`/s/{category}?<filtersToQuery(request.filters)>&q=...`).

## Уведомления (auth)

```jsonc
// Notification
{
  "id": "uuid",
  "type": "saved_search" | "price_drop",
  "title": "Новое по поиску «Toyota Camry от 2018»",
  "body": "Škoda Octavia, 2019 — 350 000 Kč",
  "image": "/media/photos/..._t.jpg",      // или null
  "listing_id": "uuid",
  "saved_search_id": "uuid",                 // только для saved_search
  "created_at": "...",
  "read": false
}
```
- `GET /v1/me/notifications?limit=50&before=<id>` → `{ "items": [Notification], "unread_count": 4 }` (новые сверху)
- `POST /v1/me/notifications/read` `{ "ids": ["..."] }` → `204`; без `ids` — прочитать все
- `GET /v1/me/notifications/unread-count` → `{ "count": 4 }`

`price_drop` приходит, когда снизилась цена объявления из избранного.

## Чат (auth)

```jsonc
// Chat
{
  "id": "uuid",
  "listing": { "id": "uuid", "title": "Škoda Octavia, 2019", "photo": "/media/..._t.jpg", "price": 350000, "currency": "CZK" },
  "peer": { "id": "uuid", "name": "Иван" },
  "role": "buyer" | "seller",                 // моя роль в диалоге
  "last_message": { "text": "Ещё актуально?", "at": "...", "mine": true },
  "unread": 2,
  "peer_read_at": "..."                       // до какого момента собеседник прочитал (галочки)
}
// Message
{ "id": "uuid", "chat_id": "uuid", "sender_id": "uuid", "mine": true, "text": "...", "created_at": "..." }
```
- `GET /v1/chats` → `{ "items": [Chat], "unread_total": 3 }` (по `last_message.at`, новые сверху)
- `POST /v1/chats` `{ "listing_id": "uuid", "text": "Здравствуйте! Ещё актуально?" }` → `201 Chat`.
  Если диалог по этому объявлению уже есть — сообщение добавляется в него (`200`). Своё объявление → `400`, неактивное → `410`.
- `GET /v1/chats/{id}` → `Chat`
- `GET /v1/chats/{id}/messages?before=<message_id>&limit=50` → `{ "items": [Message] }` (от старых к новым; `before` — для подгрузки истории)
- `POST /v1/chats/{id}/messages` `{ "text": "..." }` → `201 Message` (1–2000 символов)
- `POST /v1/chats/{id}/read` → `204`
- `GET /v1/chats/unread-count` → `{ "count": 3 }`

Лимиты: не больше 20 новых диалогов в час и 60 сообщений в минуту на пользователя (`429`).

### WebSocket событий
`GET /v1/ws?access_token=<jwt>` (upgrade). Токен в query, потому что браузерный WebSocket не умеет заголовки.
Невалидный токен → соединение закрывается с кодом `4401` (клиент обновляет токен и переподключается).
Сервер шлёт JSON-события, клиент ничего не шлёт (сообщения отправляются через REST):
```jsonc
{ "type": "message", "chat_id": "uuid", "message": Message }           // новое сообщение (и своё — для синхронизации вкладок)
{ "type": "read", "chat_id": "uuid", "reader_id": "uuid", "at": "..." } // собеседник прочитал
{ "type": "notification", "notification": Notification }
```
Сервер шлёт ping раз в 30 с. Клиент переподключается с экспоненциальной задержкой (1 → 30 с).

## Жалобы и модерация

- `POST /v1/reports` (auth) `{ "listing_id": "uuid", "reason": "fraud" | "wrong_price" | "sold" | "duplicate" | "wrong_category" | "offensive" | "other", "comment": "..." }` → `204`.
  Повторная жалоба того же пользователя на то же объявление игнорируется.

Модератор (`role` = `moderator` или `admin`), иначе `403`:
- `GET /v1/admin/reports?status=open|resolved&page=1` → `{ "items": [Report], "total": 12 }`
  ```jsonc
  { "id": "uuid", "listing": ListingCard, "reason": "fraud", "comment": "...", "reporter_id": "uuid", "status": "open",
    "created_at": "...", "reports_for_listing": 3 }
  ```
- `POST /v1/admin/reports/{id}/resolve` `{ "action": "dismiss" | "block", "reason": "Мошенничество" }` → `204`.
  `block` блокирует объявление и закрывает все открытые жалобы на него.
- `GET /v1/admin/listings?status=active|blocked|...&q=текст&user_id=uuid&page=1` → `{ "items": [ListingCard], "total": 100 }`
- `POST /v1/admin/listings/{id}/block` `{ "reason": "..." }` → `204`
- `POST /v1/admin/listings/{id}/unblock` → `204` (возвращает в `active`)

---

# Этап 3: Чехия, языки, подсказки

Рынок — **Чехия**, основная аудитория — **русско- и украиноязычные жители Чехии** (плюс чехи).

## Языки
- Поддерживаются: `ru` (по умолчанию), `uk`, `cs`, `en`.
- Клиент передаёт язык в каждом запросе заголовком `Accept-Language: uk` (первый поддерживаемый язык из заголовка; иначе `ru`).
- **Все человекочитаемые строки** в ответах — на этом языке: названия категорий, групп, атрибутов, вариантов, единиц, подсказок, сортировок, справочников (города: «Прага» / «Praha» / «Prague»), `title`, `attribute_labels`, `highlights`, `price_suffix`, `message` и `fields` ошибок, тексты уведомлений.
  Значения (`value`, id справочников, ключи атрибутов) от языка **не зависят** — URL фильтров одинаковые для всех языков.
- `User.lang`: язык пользователя (для уведомлений). `PATCH /v1/me` принимает `{ "name"?: "...", "lang"?: "cs" }`. Клиент выставляет его при смене языка в интерфейсе.

## Чехия
- Валюта **CZK** (`Kč`). Цены — целые кроны.
- Телефоны: `+420XXXXXXXXX`; номер из 9 цифр без кода (`777 123 456`) сервер дополняет до `+420`. Номера других стран (`+380`, `+7`, `+375`, `+421`, `+48`…) тоже принимаются.
- Города — Чехия (`praha`, `brno`, `ostrava`, `plzen`, …).
- Квартиры — чешская планировка (`layout`: `1+kk`, `2+1`, …), тип собственности (osobní / družstevní), энергокласс PENB, условия аренды (kauce, poplatky), «сдают иностранцам», «возможна регистрация адреса».
- Авто — STK (техосмотр), происхождение (куплен в ČR / ввезён), возможен вычет DPH, экокласс Euro.
- Мото и мопеды — категории прав ЕС (AM, A1, A2, A, B до 125 см³).
- Во всех категориях общий атрибут **`seller_langs`** (multi_enum: `ru`, `uk`, `cs`, `sk`, `en`) — «Язык общения» с продавцом, есть фильтр.

## Подсказки
- У `Attribute` и `FilterDef` новое поле **`hint: string | null`** — короткое пояснение (особенно чешских терминов для аудитории из СНГ: «2+kk — две комнаты, кухня совмещена с гостиной», «STK — обязательный техосмотр»). Клиенты показывают его под полем формы и по иконке ⓘ в фильтрах.
- **Поисковые подсказки** `GET /v1/suggest?q=шкода окт&limit=8`:
```jsonc
{ "items": [
  { "type": "model",    "label": "Škoda Octavia", "sublabel": "Автомобили", "category": "cars",
    "filters": { "make": { "in": ["skoda"] }, "model": { "in": ["skoda-octavia"] } } },
  { "type": "make",     "label": "Škoda", "sublabel": "Мотоциклы", "category": "motorcycles", "filters": { "make": { "in": ["skoda"] } } },
  { "type": "category", "label": "Квартиры", "sublabel": null, "category": "apartments", "filters": {} },
  { "type": "city",     "label": "Прага", "sublabel": "Квартиры", "category": "apartments", "filters": { "city": { "in": ["praha"] } } },
  { "type": "layout",   "label": "2+kk", "sublabel": "Квартиры", "category": "apartments", "filters": { "layout": { "in": ["2kk"] } } }
] }
```
  Ищет по названиям на всех языках и по синонимам, включая кириллицу и транслит («шкода», «skoda», «škoda»). Клиент переходит на `/s/{category}?{filtersToQuery(filters)}`.
  Если подсказка не выбрана — обычный текстовый поиск `q`.

## Реализация (этап 3)
- `GET /v1/suggest?q=шкода окт&limit=8` → `{ "items": [{ "type": "model", "label": "Škoda Octavia", "sublabel": "Автомобили", "category": "cars", "filters": { "make": {"in":["skoda"]}, "model": {"in":["skoda-octavia"]} } }] }`.
  `type`: `category | make | model | city | layout`. Поиск без учёта диакритики и раскладки букв (`plzen` = `Plzeň` = «Пльзень»), с разговорными синонимами («бэха», «фольц»).
- Тексты уведомлений пишутся на языке получателя (`User.lang`) в момент создания.
- В чате название объявления отдаётся на языке запроса.
