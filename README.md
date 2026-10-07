# Room Booking

> Полный README — в фазе 6 (см. `PLAN.md`). Ниже — решения, зафиксированные по ходу работы.

## Компромиссы

- **Ложный 409 при высокой конкуренции (Redis).** Запись брони в Redis — оптимистическая блокировка по версии даты:
  сервер читает брони за дату, проверяет пересечения доменной функцией `findConflicts`, а Lua-скрипт записывает
  только если версия даты не изменилась. При изменении версии запрос повторяется до 3 раз, затем возвращается 409.
  Если за одну дату одновременно пишут больше трёх клиентов подряд, кто-то может получить 409 без реального
  пересечения. Для демо одной комнаты это осознанно приемлемо: правило пересечений не дублируется в Lua,
  нет замков с TTL, а UI обрабатывает 409 без потери ввода — повторная отправка проходит.
- **Хранилище без env — in-memory.** Без переменных Redis сервер хранит брони в памяти процесса; на serverless
  данные не общие между инстансами и теряются при перезапуске. Для проверки с нескольких устройств нужен Redis.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
