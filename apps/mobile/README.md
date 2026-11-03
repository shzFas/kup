# kup — мобильное приложение (Expo)

React Native / Expo SDK 58, Expo Router, TypeScript strict, TanStack Query.
Отдельный npm-проект (не входит в pnpm workspace). Общий код — `@kup/shared`
(`file:../../packages/shared`, Metro видит его через `watchFolders` в `metro.config.js`).

## Запуск

```bash
cd apps/mobile
npm install
cp .env.example .env      # при необходимости поменять адрес API
npm start                 # i — iOS-симулятор, a — Android-эмулятор
```

`EXPO_PUBLIC_API_URL` — адрес gateway (по умолчанию `http://localhost:8180`):

| Где запускается          | Значение                              |
|--------------------------|---------------------------------------|
| iOS-симулятор            | `http://localhost:8180`               |
| Android-эмулятор         | `http://10.0.2.2:8180`                |
| Реальное устройство      | `http://<LAN IP вашего Mac>:8180`     |

После изменения `.env` перезапустите `npm start` (переменные встраиваются при сборке бандла).

Все npm-скрипты запускают Expo с `EXPO_NO_TELEMETRY=1`. Приложение не использует сторонние
сервисы (push, EAS Update, аналитика, удалённые шрифты, карты): только собственный API.

Нативные модули (secure-store, image-picker, image-manipulator, localization) входят в Expo Go; для
production-сборки — `npx expo run:ios|android` (локально, без EAS).

## Проверки

```bash
npm run typecheck                 # tsc --noEmit
npm run export:ios                # проверка, что Metro собирает бандл (вкл. @kup/shared)
npm run export:android
rm -rf dist
```

## Структура

- `src/app` — экраны (Expo Router):
  - `(tabs)` — Поиск · Избранное (Объявления | Поиски) · Подать (+) · Сообщения · Профиль
  - `(tabs)/profile/*` — стек профиля: профиль (язык, выход), «Мои объявления», «Сохранённые поиски», «Уведомления» (с бейджами)
  - `search/[category]` — выдача: быстрые фильтры, чипы, сортировка, «Сохранить поиск», бесконечная лента
  - `filters/[category]` — модальный экран фильтров из `schema.filters` (ⓘ — подсказка `hint`) + «Показать N объявлений»
  - `picker` — выбор значений справочника (`/v1/refs/{ref}`), одиночный и множественный
  - `listing/[id]` — карточка: история цены, «Похожие», «Позвонить» + «Написать» (шаблоны → чат), «Пожаловаться»,
    «Продавец говорит: …», баннеры владельца (истёк срок / заблокировано) и «Продлить»
  - `chat/[id]` — диалог: перевёрнутый список, ✓/✓✓, подгрузка истории, оптимистичная отправка
  - `post/[category]`, `edit/[id]` — форма подачи/редактирования (цена в Kč, подсказки под полями)
  - `login` — вход по номеру телефона (выбор страны, по умолчанию +420) и SMS-коду (в dev подставляется `dev_code`)
  - `[category]` — deep link `kup://cars?make=skoda&year=2015..2020` → выдача
- `src/components/filters` — `FilterRenderer` и виджеты (range, multi, multi_all, toggle, select, ref)
- `src/components/form` — форма объявления из `schema.attributes`, загрузка фото (JPEG, ≤2560 px)
- `src/lib` — API-клиент (токены в SecureStore, `Accept-Language`), авторизация, состояние поиска, тема,
  `events.tsx` (единый WebSocket `/v1/ws`: пауза в фоне, переподключение и обновление счётчиков), `chatCache.ts`
- `src/i18n` + `src/lib/i18n.ts` — свой i18n: словари `ru` (ключи), `uk`, `cs`, `en`; `useI18n()` → `t()`, `tp()` (множественное
  число), даты/числа/цены через `Intl` с запасным форматированием. Язык по умолчанию — из локали устройства
  (`expo-localization` → `pickLang`), выбор в Профиле сохраняется в SecureStore и отправляется в `PATCH /v1/me`;
  при смене языка кэш React Query инвалидируется (подписи приходят с сервера на нужном языке).

Deep links: `kup://search/cars?make=skoda`, `kup://cars?...`, `kup://listing/<id>`, `kup://chat/<id>`.
