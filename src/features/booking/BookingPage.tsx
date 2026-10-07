"use client";

import { useState } from "react";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { DateString } from "@/domain/booking/types";
import { bookingsApi, type BookingsApi } from "@/lib/api/bookings";
import { BookingList } from "./components/BookingList";
import { DatePicker } from "./components/DatePicker";
import { StatusBanner } from "./components/StatusBanner";
import { useBookings } from "./hooks/useBookings";
import { useNow } from "./hooks/useNow";

type Props = { api?: BookingsApi };

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка бронирований" className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-zinc-200" />
      ))}
    </div>
  );
}

export function BookingPage({ api = bookingsApi }: Props) {
  const now = useNow();
  // Until the user picks a date, follow today in the room time zone.
  const [picked, setPicked] = useState<DateString | null>(null);
  const date = picked ?? now?.date ?? null;

  const { bookings, isLoading, isRefreshing, error, reload } = useBookings(
    date,
    { api },
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Бронирование переговорной
      </h1>

      {date ? <DatePicker value={date} onChange={setPicked} /> : null}

      {error ? (
        <StatusBanner
          variant="error"
          message={API_ERROR_MESSAGES[error.code]}
          actionLabel="Повторить"
          onAction={reload}
        />
      ) : null}

      <section aria-label="Список бронирований" className="flex flex-col gap-3">
        {isRefreshing ? (
          <p role="status" aria-live="polite" className="text-xs text-zinc-500">
            Обновление…
          </p>
        ) : null}

        {isLoading || (date === null) ? (
          <ListSkeleton />
        ) : bookings && date ? (
          bookings.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-zinc-600">
              На эту дату бронирований нет
            </p>
          ) : (
            <BookingList bookings={bookings} date={date} now={now} />
          )
        ) : null}
      </section>
    </main>
  );
}
