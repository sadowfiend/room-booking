"use client";

import { useState } from "react";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import { VALIDATION_MESSAGES } from "@/domain/booking/messages";
import type { Booking, DateString } from "@/domain/booking/types";
import { bookingsApi, type BookingsApi } from "@/lib/api/bookings";
import { BookingForm } from "./components/BookingForm";
import { BookingList } from "./components/BookingList";
import { DatePicker } from "./components/DatePicker";
import { DeleteConfirm } from "./components/DeleteConfirm";
import { StatusBanner } from "./components/StatusBanner";
import { useBookings } from "./hooks/useBookings";
import { useNow } from "./hooks/useNow";

type Props = { api?: BookingsApi };

type Panel =
  | { kind: "create" }
  | { kind: "edit"; booking: Booking }
  | { kind: "delete"; booking: Booking };

type Notice = { variant: "info" | "error"; message: string };

const addButtonClass =
  "self-start rounded-md bg-blue-700 px-4 py-2 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60";

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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const changeDate = (next: DateString) => {
    setPicked(next);
    setPanel(null);
    setNotice(null);
  };

  const { bookings, isLoading, isRefreshing, error, reload } = useBookings(
    date,
    { api },
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Бронирование переговорной
      </h1>

      {date ? <DatePicker value={date} onChange={changeDate} /> : null}

      {notice ? (
        <StatusBanner variant={notice.variant} message={notice.message} />
      ) : null}

      {error ? (
        <StatusBanner
          variant="error"
          message={API_ERROR_MESSAGES[error.code]}
          actionLabel="Повторить"
          onAction={reload}
        />
      ) : null}

      {date && now ? (
        <div className="flex flex-col gap-3">
          {panel === null ? (
            date < now.date ? (
              <div className="flex flex-col gap-1">
                <button type="button" disabled className={addButtonClass}>
                  Новая бронь
                </button>
                <p className="text-sm text-zinc-600">
                  {VALIDATION_MESSAGES.PAST_DATE}
                </p>
              </div>
            ) : (
              <button
                type="button"
                disabled={bookings === null}
                onClick={() => {
                  setNotice(null);
                  setPanel({ kind: "create" });
                }}
                className={addButtonClass}
              >
                Новая бронь
              </button>
            )
          ) : null}

          {panel?.kind === "create" || panel?.kind === "edit" ? (
            <BookingForm
              key={panel.kind === "edit" ? panel.booking.id : "create"}
              api={api}
              date={date}
              existing={bookings ?? []}
              now={now}
              original={panel.kind === "edit" ? panel.booking : undefined}
              reload={reload}
              onCancel={() => setPanel(null)}
              onSaved={(_, mode) => {
                setPanel(null);
                setNotice({
                  variant: "info",
                  message: mode === "edit" ? "Бронь обновлена" : "Бронь создана",
                });
                reload();
              }}
              onNotFound={() => {
                setPanel(null);
                setNotice({
                  variant: "error",
                  message: API_ERROR_MESSAGES.NOT_FOUND,
                });
              }}
            />
          ) : null}

          {panel?.kind === "delete" ? (
            <DeleteConfirm
              key={panel.booking.id}
              api={api}
              booking={panel.booking}
              onCancel={() => setPanel(null)}
              onDeleted={() => {
                setPanel(null);
                setNotice({ variant: "info", message: "Бронь удалена" });
                reload();
              }}
              onNotFound={() => {
                setPanel(null);
                setNotice({
                  variant: "error",
                  message: API_ERROR_MESSAGES.NOT_FOUND,
                });
                reload();
              }}
            />
          ) : null}
        </div>
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
            <BookingList
              bookings={bookings}
              date={date}
              now={now}
              onEdit={(b) => {
                setNotice(null);
                setPanel({ kind: "edit", booking: b });
              }}
              onDelete={(b) => {
                setNotice(null);
                setPanel({ kind: "delete", booking: b });
              }}
            />
          )
        ) : null}
      </section>
    </main>
  );
}
