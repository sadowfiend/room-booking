# Переписки с AI

С чего начать:

| Файл | Что внутри |
|---|---|
| [`transcript.md`](transcript.md) | **Читабельная переписка**: запросы целиком и итоговый ответ Claude на каждый, по фазам. Без вывода инструментов и служебных сообщений. |
| [`01-planning-digest.md`](01-planning-digest.md) | Сжатая сводка основной сессии: фазы 0–4.5, решения, пойманные ошибки, проверки. |
| [`02-implementation-digest.md`](02-implementation-digest.md) | Сжатая сводка сессий реализации: сервер, Redis, UI, интеграция. |

Сырые логи — в [`raw/`](raw/), для проверки деталей. Время — UTC, значения секретов заменены на `[REDACTED]`.

| Файл | Сессия | Фаза PLAN.md |
|---|---|---|
| [`raw/session-0-full.md`](raw/session-0-full.md) | Планирование | 0, 1.1 |
| [`raw/session-1-full.md`](raw/session-1-full.md) | Параллельная сессия в том же рабочем дереве (запущена по ошибке) | 1.2 |
| [`raw/session-6-full.md`](raw/session-6-full.md) | Основная сессия, `main` | 1.2–1.4, 2, план 3, 4, план 4.5 |
| [`raw/session-5-full.md`](raw/session-5-full.md) | Ветка `feat/server` | 3A, 3C |
| [`raw/session-7-full.md`](raw/session-7-full.md) | Ветка `feat/ui` | 3B-1, 3B-2 |

Удалены как лишние: три служебные сессии (только `node -v`, `pwd`, `git branch`) и `01-planning.txt` — дубль
`raw/session-0-full.md` в другом формате. Они остаются в истории git.
