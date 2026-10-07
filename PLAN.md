# PLAN — Room Booking

## Решения (зафиксировано)
- Слои: `src/domain` (чистые правила) → `src/server` (repository + service) → `src/app/api` (тонкие handlers);
  `src/lib/api` (клиент, типизированные ошибки) → `src/features/booking` (UI).
- Часовой пояс комнаты: `Asia/Bishkek`, переопределение через `NEXT_PUBLIC_ROOM_TZ`.
- Рабочий день 09:00–18:00, шаг 15 мин (решение заказчика), длительность 30–120 мин — одна конфигурация в `src/domain/booking/config.ts`.
- Прошлое: слот доступен, если `start >= now` (в TZ комнаты). Без округления.
- Интервалы полуоткрытые `[start, end)`: касание границ не конфликт.
- Прошедшие брони (`end <= now`) — только просмотр. Идущие — редактирование и удаление разрешены:
  `start` можно оставить исходным, новый `start >= now`, `end > now`.
- PATCH принимает полное тело `{ date, start, end, title? }` (как PUT), без слияния с исходной бронью.
- Хранилище: асинхронный `BookingRepository`; Redis (задача 3C) при заданном env, иначе in-memory.
  Заказчик проверяет с нескольких устройств, поэтому на деплое нужен Redis.
- Новых зависимостей нет: ни zod, ни TanStack Query (обоснование — в README). Исключение — клиент Redis в 3C,
  только с явного разрешения.
- Демонстрация 409: заголовок `x-mock-force-conflict` принимается сервером только при `MOCK_ALLOW_FORCED_CONFLICT=1`;
  переключатель в UI с подписью «Инструмент разработчика» виден только при `NEXT_PUBLIC_DEV_TOOLS=1`.

### Контракт ошибок API
Единое тело ошибки: `{ code, message, errors?, conflicts? }`.

| Статус | code | Когда | Доп. поля |
|---|---|---|---|
| 400 | `BAD_REQUEST` | битый JSON, неверный Content-Type | — |
| 422 | `VALIDATION` | любая ошибка данных: формат и бизнес-правила | `errors: { field?, code }[]` |
| 409 | `CONFLICT` | пересечение с другой бронью (в т.ч. форсированное) | `conflicts: Booking[]` |
| 404 | `NOT_FOUND` | бронь не найдена | — |

Коды в `errors` — те же, что возвращает доменный `validateBooking` / `parseBookingInput`.

## Open questions
- Редактирование и удаление идущих броней (сейчас: разрешены, с правилом выше). Это допущение, в ТЗ его нет.
- Выходные и горизонт бронирования (сейчас: без ограничений).
- Перенос брони на другую дату через PATCH (сейчас: разрешён).

## Процесс
- Общая проверка после каждой задачи: `npm run typecheck && npm run lint && npm test`.
  `npm run build` — в конце фаз 4 и 6.
- Коммит после каждой фазы, только при зелёных проверках, после показа `git diff --stat`.
  Формат сообщения: `feat(domain): ...`, `feat(server): ...`, `chore(setup): ...` и т.п.
- После каждой фазы — строка в `docs/ai-usage.md` (фаза, агент, модель, % лимита из `/usage`, результат).

---

## Фаза 0. Подготовка (последовательно, основная сессия)
**0.1 Инфраструктура тестов**
- Файлы: `vitest.config.mts`, `vitest.setup.ts`, `src/smoke.test.tsx` (удаляется в фазе 1), `.nvmrc` (22), `engines` в `package.json`.
- Готово: vitest запускается; по умолчанию окружение node, UI-тесты включают jsdom через `// @vitest-environment jsdom`;
  jest-dom подключён; alias `@/*` работает.
- Проверка: `npm test && npm run typecheck`

**0.2 Документы и агенты**
- Файлы: `PLAN.md`, `CLAUDE.md`, `SPEC.md` (Open questions), `.claude/agents/*.md`, `.claude/settings.json`, `docs/ai-usage.md`.
- Готово: агенты видны в `/agents`; в settings разрешены команды проверки и read-only git.
- Проверка: ручная.

## Фаза 1. Домен (последовательно: implementer → test-writer)
**1.1 Конфиг, типы, время**
- Файлы: `src/domain/booking/config.ts`, `types.ts`, `time.ts`
- `Booking`, `BookingInput`, `ValidationCode` (union); `toMinutes`/`fromMinutes`;
  `getZonedNow(instant, tz)` → `{ date: YYYY-MM-DD, minutes }`; `generateTimeSlots()`.
- Готово: все функции чистые, `now` передаётся параметром, `Date.now()` внутри домена не вызывается.

**1.2 Правила**
- Файлы: `src/domain/booking/rules.ts`, `parse.ts`, `messages.ts`
- `validateBooking(input, { now, original? })` → `ValidationIssue[]` (`{ field?, code }`):
  правила 1–4, 6 и правило про идущие брони. Пересечения не проверяет.
  Без двойных ошибок: время не по шагу (`OFF_STEP`) → длительность не проверяется;
  `START_IN_PAST` → `END_IN_PAST` не добавляется.
- `findConflicts(input, existing, excludeId?)` → `Booking[]`: правило 5 (полуоткрытые интервалы `[start, end)`)
  и правило 7 (бронь с `id === excludeId` исключается при редактировании).
- Порядок на сервере: сначала 422 (`validateBooking`), затем 409 (`findConflicts`).
  Форма вызывает обе функции для подсказок; решающее слово за сервером.
- `parseBookingInput(unknown)` → `Result<BookingInput, ValidationIssue[]>`.
- `messages.ts`: код → русский текст. Единственное место с текстами ошибок.
- Готово: правила 1–7 из SPEC и правило про идущие брони реализованы.

**1.3 Тесты домена** (test-writer, по SPEC и контракту, не по реализации)
- Файлы: `src/domain/booking/*.test.ts`; удалить `src/smoke.test.tsx`.
- Обязательные случаи времени (из проверок 1.1): Бишкек — 18:00 UTC = следующая дата 00:00, 17:59 UTC = 23:59;
  `2026-02-30` отклоняется, `2028-02-29` принимается; `generateTimeSlots()` даёт 37 слотов (шаг 15);
  неверный TZ заменяется на `Asia/Bishkek`.
- Обязательные случаи правил: 09:00/18:00 на границах; ровно 30, 45 и 120 мин; 29/40 → не по шагу, 150 → больше максимума;
  касание 10–11 и 11–12; вложенный и перекрывающий интервал; исключение текущей брони при редактировании;
  прошедшая дата; сегодня `start == now` и `start < now`; идущая бронь (сохранить `start` / сдвинуть `start` в прошлое /
  `end <= now`); мусор в `parseBookingInput`.
- Проверка: `npm test -- src/domain`

**1.4 Доступность слотов** (implementer → test-writer)
- Файлы: `src/domain/booking/availability.ts`, `messages.ts` (текст «занято»), `availability.test.ts`.
- `getSlotAvailability(date, { existing, now, original? })` → `SlotAvailability[]` по ячейкам шага
  `[t, t + 15)`, `t` = 09:00 … 17:45 (36 ячеек). Каждая ячейка: `available` | `past` (с `code`: `PAST_DATE` / `START_IN_PAST` / `BOOKING_FINISHED`)
  | `busy` (с `conflicts: Booking[]`). Чистая функция, переиспользует `validateBooking` / `findConflicts`, правила не дублирует.
- Приоритет: `past` важнее `busy`. Своя бронь при редактировании не занимает ячейки (`excludeId = original.id`);
  у идущей `original` ячейка с исходным `start` не считается прошедшей.
- Используется формой (3B-2) для `aria-disabled` и причины. Варианты `end` для выбранного `start` форма проверяет
  через `validateBooking` + `findConflicts`, без своих правил.
- Проверка: `npm test -- src/domain`

## Фаза 2. Контракт API (последовательно, implementer)
**2.1 Клиент и ошибки**
- Файлы: `src/lib/api/errors.ts` (`ApiError`, `BadRequestError`, `ValidationError`, `ConflictError`, `NotFoundError`, `NetworkError`),
  `src/lib/api/contract.ts` (типы тел ответов и ошибок), `src/lib/api/bookings.ts` (`list/create/update/remove`,
  `baseUrl`, `signal`, опция `forceConflict`), `src/lib/api/*.test.ts`.
- Успешные ответы: `GET` 200 → `{ bookings: Booking[] }` (по `start`); `POST` 201 → `Booking`; `PATCH` 200 → `Booking`;
  `DELETE` 204 без тела. Все запросы с `cache: "no-store"`; тело JSON с `Content-Type: application/json`.
- Статус вне контракта (5xx и т.п.) или нечитаемый JSON → `ApiError` с кодом `UNKNOWN`; сбой `fetch` → `NetworkError`;
  отмена через `signal` пробрасывается как `AbortError` (не `NetworkError`), чтобы хуки её игнорировали.
- `contract.ts` — общий для клиента и сервера (3A импортирует оттуда типы тел и заголовок `x-mock-force-conflict`).
- Готово: UI не видит `fetch` и HTTP-статусы; каждый статус соответствует своему классу ошибки.
- Проверка: `npm test -- src/lib/api` (fetch замокан).
- Коммит — точка ветвления для фазы 3.

## Фаза 3. Сервер и UI
Параллельно только ветки `feat/server` (3A → 3C) и `feat/ui` (3B-1 → 3B-2), каждая в своём worktree.
3C стартует после 3A в той же ветке, 3B-2 — после 3B-1.

**3A. Сервер** (implementer, ветка `feat/server`)
- Файлы: `src/server/repository.ts` (интерфейс), `src/server/memory-repository.ts` (синглтон на `globalThis`),
  `src/server/booking-service.ts` (parse → validate → атомарный check+write в репозитории, 404, форсированный конфликт),
  `src/server/http.ts` (ошибки сервиса → `Response`), `src/app/api/bookings/route.ts` (GET, POST),
  `src/app/api/bookings/[id]/route.ts` (PATCH, DELETE), `src/server/*.test.ts`.
- Инвариант: сервис всегда вызывает `parseBookingInput` до `validateBooking` (домен не проверяет формат повторно).
- `BookingRepository` асинхронный с первого дня (все методы возвращают `Promise`), чтобы Redis в 3C встал без правки сервиса.
  Проверка пересечений и запись — одна атомарная операция репозитория, конфликт он ищет доменным `findConflicts`:
  ```ts
  type WriteResult =
    | { ok: true; booking: Booking }
    | { ok: false; reason: "conflict"; conflicts: Booking[] }
    | { ok: false; reason: "not_found" };
  interface BookingRepository {
    readonly kind: "memory" | "redis";
    listByDate(date: DateString): Promise<Booking[]>;   // отсортировано по start
    getById(id: string): Promise<Booking | null>;
    create(input: BookingInput): Promise<WriteResult>;  // findConflicts + вставка, атомарно
    update(id: string, input: BookingInput): Promise<WriteResult>; // findConflicts(excludeId = id) + замена, атомарно
    remove(id: string): Promise<boolean>;               // false → 404
  }
  ```
  Сервис для PATCH: `getById` (404) → `validateBooking(input, { now, original })` → `repo.update`.
  In-memory: внутри `create`/`update` между чтением и записью нет `await`, поэтому операция атомарна в пределах процесса.
- Правила: handlers не длиннее ~20 строк; `params` в Next 16 — Promise; без `export const dynamic` (включён `cacheComponents`).
- Свежесть GET: первой строкой `await connection()` (из `next/server`), явно отключает пререндер;
  все ответы API с `Cache-Control: no-store`; клиент вызывает `fetch` с `cache: "no-store"`.
- Проверка свежести: в выводе `npm run build` маршрут `/api/bookings` помечен как динамический (ƒ), не статический.
- Тесты: сервис + вызов handlers через `new Request` — 400, 422, 409, 404, исключение текущей брони, форсированный конфликт
  только при включённом env.
- Проверка: `npm test -- src/server src/app/api && npm run typecheck`

**3C. Redis** (implementer → test-writer, ветка `feat/server`, после 3A)
- Файлы: `src/server/redis-repository.ts`, `src/server/redis-scripts.ts` (Lua), `src/server/repository-factory.ts`
  (выбор по env), `src/app/api/health/route.ts`, `src/server/*.test.ts`, `.env.example`, `package.json`.
- Зависимость: `@upstash/redis` (HTTP-клиент, работает в serverless на Vercel без пула соединений). Это обычная,
  а не dev-зависимость: код выполняется в проде. Добавляется только с явного разрешения.
- Схема данных: `booking:{id}` → JSON брони; `bookings:{date}` → hash `id → JSON`; `bookings:{date}:ver` → счётчик версии.
- Атомарность — оптимистическая блокировка через Lua `EVAL` (рекомендуемый вариант):
  1. прочитать `bookings:{date}` и `ver`; 2. в TS вызвать доменный `findConflicts`; 3. `EVAL`-скрипт записывает,
  только если `ver` не изменился (сравнение + `HSET` + `INCR` в одном скрипте), иначе возвращает 0 → повтор (до 3 раз,
  затем 409 с актуальными конфликтами). Перенос на другую дату проверяет и увеличивает версии обеих дат в одном скрипте.
  - Осознанный компромисс: при высокой конкуренции за одну дату (больше 3 параллельных записей подряд) клиент может
    получить ложный 409, хотя пересечения нет. Для демо одной комнаты это приемлемо; UI обрабатывает 409 без потери
    ввода, повторная отправка проходит. Описать в README (раздел «Компромиссы»).
  - Почему не проверка пересечений целиком в Lua: правило 5 пришлось бы дублировать на Lua, а это нарушает
    «правила не дублировать». Скрипт сравнивает только версии.
  - Почему не блокировка на дату (`SET lock NX PX`): нужен TTL и обработка «протухшего» замка; при падении функции
    дата блокируется до истечения TTL. CAS по версии не держит замков и не зависает.
  - Почему не `WATCH/MULTI`: HTTP-клиент Upstash не держит соединение, `WATCH` через него не работает.
- Зависимость `@upstash/redis` разрешена (обычная, не dev) — только в 3C, ветка `feat/server`.
- Выбор хранилища: имена env выдаёт интеграция Vercel Marketplace, одно имя не зашивать. Список допустимых пар
  «URL + токен» в порядке приоритета, пара берётся целиком (URL и токен из разных пар не смешивать):
  1. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash напрямую);
  2. `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash через Vercel Marketplace / бывший Vercel KV);
  3. `<PREFIX>_KV_REST_API_URL` + `<PREFIX>_KV_REST_API_TOKEN` — если в Vercel задан свой префикс (поиск по суффиксу,
     при нескольких совпадениях — ошибка в лог и in-memory).
  Не используются: `*_READ_ONLY_TOKEN` (нужна запись), `REDIS_URL` / `KV_URL` (TCP `rediss://`, REST-клиенту не подходят).
  Список — одна константа в `repository-factory.ts`; выбранная пара логируется по имени переменной, без значения.
  Ни одна пара не найдена → in-memory и одно предупреждение в лог. Без env поведение как в 3A; ограничение — в README.
- Индикатор: `GET /api/health` → `{ ok: true, storage: "redis" | "memory" }` (`Cache-Control: no-store`).
  Контракт броней не меняется; проверяется `curl` на деплое.
- Тесты: один набор контрактных тестов `BookingRepository`, который прогоняется на памяти всегда, а на Redis — только
  при `REDIS_TEST=1` (иначе `skip`); тест гонки: 10 параллельных `create` на пересекающийся слот → ровно один успех,
  остальные `conflict`; повтор при несовпадении версии (подставной клиент); выбор репозитория по env; `/api/health`.
- Проверка: `npm test -- src/server src/app/api && npm run typecheck && npm run lint`.
- Готово: на деплое с env бронь, созданная на одном устройстве, видна на другом; `/api/health` показывает `redis`.

**3B-1. UI: данные и список** (implementer, ветка `feat/ui`, только через `src/lib/api`)
- Файлы: `src/features/booking/hooks/useBookings.ts` (AbortController, `reload`, без сброса данных при обновлении),
  `hooks/useNow.ts` (только на клиенте, тик раз в минуту), `components/DatePicker.tsx` (нативный `input[type=date]`),
  `components/BookingList.tsx` (брони + метки «прошла» / «идёт»), `components/StatusBanner.tsx`,
  `BookingPage.tsx`, `src/app/page.tsx`, тесты рядом.
- Состояния: loading (skeleton), empty, error + «Повторить», refreshing.
- Тесты: loading / empty / error / retry; ответ на старую дату не перезаписывает новую.
- Проверка: `npm test -- src/features && npm run typecheck && npm run lint`

**3B-2. UI: форма и ошибки сервера** (implementer, ветка `feat/ui`, после 3B-1)
- Файлы: `components/BookingForm.tsx`, `components/TimeSlotPicker.tsx` (выбор времени внутри формы, на базе
  `getSlotAvailability`),
  `components/DeleteConfirm.tsx`, `components/DevConflictToggle.tsx` (подпись «Инструмент разработчика»),
  правки `BookingPage.tsx`, тесты рядом.
- Сетка `generateTimeSlots()` из 37 слотов включает 18:00. Списки в форме строить с фильтром:
  `start` не может быть 18:00, `end` не может быть 09:00.
- Выбор времени — два нативных `<select>` (start и end), не сетка кнопок: при шаге 15 мин в каждом по 36 значений.
  Недоступные варианты — `<option disabled>` с причиной в тексте («10:15 — занято», «09:30 — прошло», тексты из
  `messages.ts`); общая подсказка у `select` через `aria-describedby`. Варианты `end` пересчитываются при смене `start`.
- Форма: локальное состояние, ошибки по полям из `messages.ts`, submitting (disabled + `aria-busy`).
- 409: форма остаётся открытой, значения сохранены, баннер с конфликтующими бронями, `reload` списка, фокус на баннер.
- 404 при PATCH/DELETE: сообщение + `reload`, форма закрывается.
- A11y: `label` у полей, `aria-live` для статусов, видимый focus, управление с клавиатуры; вёрстка от 360px.
- Тесты: `ConflictError` не теряет ввод и вызывает `reload`; 404; недоступные слоты при подставном `now`.
- Проверка: `npm test -- src/features && npm run typecheck && npm run lint`

## Фаза 4. Интеграция (основная сессия)
- Слить `feat/server` (3A + 3C) и `feat/ui` в `main`.
- Файлы: `docs/manual-qa.md` — чек-лист: создать; касание границ; пересечение; 409 через флаг;
  редактирование идущей брони; удаление; прошедшая дата; 404 после удаления в другой вкладке; бронь видна со второго устройства (Redis); смена даты во время загрузки;
  мобильная ширина и клавиатура.
- Ручной прогон по чек-листу на `npm run dev`.
- Готово: `npm run typecheck && npm run lint && npm test && npm run build` зелёные, чек-лист пройден.

## Фаза 5. Ревью (reviewer, opus, чистый контекст, один раз)
- Вход: `git diff <коммит фазы 0>..HEAD`, `SPEC.md`, `PLAN.md`.
- Фокус: расхождения с ТЗ, дублирование правил, `fetch` в UI, потеря ввода, a11y, гонки.
- Исправления — implementer по списку находок, затем общая проверка.

## Фаза 6. README и деплой
- Файлы: `README.md` — запуск, архитектура, решения и допущения (включая идущие брони, отказ от zod/TanStack Query,
  лимиты агентов только в промпте), хранилище (Redis на деплое, in-memory без env и его ограничение на serverless), компромиссы (ложный 409 после 3 повторов CAS), как показать 409, что бы сделал дальше.
- Vercel: env `NEXT_PUBLIC_DEV_TOOLS=1`, `MOCK_ALLOW_FORCED_CONFLICT=1`, переменные Redis от интеграции Upstash
  в Vercel Marketplace (любая пара из списка 3C); проверить прод-сборку и `/api/health` → `redis`.
- Готово: деплой открывается, сценарии `docs/manual-qa.md` проходят на проде, включая проверку со второго устройства.

---

## Агенты (`.claude/agents`)
| Агент | Модель | Инструменты | Назначение | Лимит отчёта |
|---|---|---|---|---|
| planner | opus | Read, Grep, Glob | Декомпозиция фазы, уточнение контракта; кода не пишет | ≤ 60 строк |
| implementer | sonnet | Read, Edit, Write, Grep, Glob, Bash | Реализация строго в перечисленных файлах | ≤ 25 строк |
| test-writer | sonnet | Read, Edit, Write, Grep, Glob, Bash | Тесты по SPEC/контракту; правит только `*.test.*` | ≤ 20 строк |
| scout | haiku | Read, Grep, Glob | Поиск по коду | ≤ 15 строк, только `file:line` |
| reviewer | opus | Read, Grep, Glob, Bash (только чтение) | Ревью в чистом контексте | ≤ 10 находок |

- Лимиты отчёта и ограничения Bash для отдельного агента — инструкции в промпте, а не техническое ограничение.
  Технически задаются только `model` и `tools`; разрешения команд — общие, в `.claude/settings.json`.
- В каждом задании: список файлов, критерий готовности, команда проверки.
- Параллельно не больше 2 агентов, каждый в своём worktree. Фазы 0–2 строго последовательны.
- Коммитит только основная сессия.
