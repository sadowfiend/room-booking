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
import { EmptyCalendarIllustration, PlusIcon } from "./components/icons";

type Props = { api?: BookingsApi };

type Panel =
  | { kind: "create" }
  | { kind: "edit"; booking: Booking }
  | { kind: "delete"; booking: Booking };

type Notice = { variant: "info" | "error"; message: string };

const addButtonBase =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-medium text-on-accent hover:opacity-90 active:scale-[0.98] active:opacity-80 disabled:opacity-60 shadow-sm";
// On narrow screens the button stays in DOM order but is pinned to the bottom edge;
// <main> reserves bottom padding so it never covers the last card.
const addButtonClass = `${addButtonBase} self-start max-sm:fixed max-sm:right-[max(1rem,env(safe-area-inset-right))] max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:left-[max(1rem,env(safe-area-inset-left))] max-sm:z-30`;

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка бронирований" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[4.5rem] rounded-xl border border-border bg-surface motion-safe:animate-pulse"
        />
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:py-8 sm:pb-8">
      <h1 className="text-2xl font-semibold text-text">
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
                <button type="button" disabled className={addButtonBase}>
                  <PlusIcon />
                  Новая бронь
                </button>
                <p className="text-sm text-muted">
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
                <PlusIcon />
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
          <p role="status" aria-live="polite" className="text-xs text-muted">
            Обновление…
          </p>
        ) : null}

        {isLoading || (date === null) ? (
          <ListSkeleton />
        ) : bookings && date ? (
          bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-8">
              <EmptyCalendarIllustration />
              <p className="text-center text-muted">
                На эту дату бронирований нет
              </p>
            </div>
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
