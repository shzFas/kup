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
{ "phone": "+77011234567" }
```
→ `200`
```json
{ "sent": true, "retry_after_sec": 60, "dev_code": "1234" }
```
`dev_code` присутствует только в dev-режиме (SMS не отправляется) — клиент может подставить его автоматически/показать подсказку.
Телефон: E.164, `+` и 10–15 цифр. Повторный запрос раньше `retry_after_sec` → `429`.

### `POST /v1/auth/otp/verify`
```json
{ "phone": "+77011234567", "code": "1234" }
```
→ `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "b3J...",
  "expires_in": 900,
  "user": { "id": "uuid", "phone": "+77011234567", "name": "", "created_at": "..." }
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
  "currency": "KZT",
  "price_suffix": "",                       // "" | "/мес" | "/сутки" (аренда квартир)
  "city": { "id": "almaty", "name": "Алматы" },
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
### `GET /v1/listings/{id}/phone` (auth) → `{ "phone": "+77011234567" }`

### `POST /v1/listings` (auth) — создать и сразу опубликовать
```json
{
  "category": "cars",
  "price": 12500000,
  "currency": "KZT",
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
