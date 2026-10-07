import { toMinutes } from "@/domain/booking/time";
import type { Booking, DateString, ZonedNow } from "@/domain/booking/types";

type Props = {
  bookings: Booking[];
  /** The date being displayed. */
  date: DateString;
  /** `null` until the client clock is known: no status labels then. */
  now: ZonedNow | null;
  /** Edit/delete actions are offered only for bookings that are not finished. */
  onEdit?: (booking: Booking) => void;
  onDelete?: (booking: Booking) => void;
};

type Status = "past" | "ongoing" | null;

function getStatus(b: Booking, date: DateString, now: ZonedNow | null): Status {
  if (!now) return null;
  if (date < now.date) return "past";
  if (date > now.date) return null;
  if (toMinutes(b.end) <= now.minutes) return "past";
  if (toMinutes(b.start) <= now.minutes) return "ongoing";
  return null;
}

const STATUS_LABEL: Record<Exclude<Status, null>, string> = {
  past: "прошла",
  ongoing: "идёт",
};

const actionClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

export function BookingList({ bookings, date, now, onEdit, onDelete }: Props) {
  const sorted = [...bookings].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start),
  );
  return (
    <ul className="flex flex-col gap-2" aria-label="Бронирования на выбранную дату">
      {sorted.map((b) => {
        const status = getStatus(b, date, now);
        return (
          <li
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="break-words font-medium text-zinc-900">
                {b.title?.trim() || "Без названия"}
              </p>
              <p className="text-sm text-zinc-600">
                <time>{b.start}</time>
                {" – "}
                <time>{b.end}</time>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    status === "ongoing"
                      ? "bg-green-100 text-green-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {STATUS_LABEL[status]}
                </span>
              ) : null}
              {now && status !== "past" && onEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(b)}
                  aria-label={`Изменить бронь ${b.start}–${b.end}`}
                  className={actionClass}
                >
                  Изменить
                </button>
              ) : null}
              {now && status !== "past" && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(b)}
                  aria-label={`Удалить бронь ${b.start}–${b.end}`}
                  className={actionClass}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
