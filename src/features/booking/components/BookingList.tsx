import { toMinutes } from "@/domain/booking/time";
import type { Booking, DateString, ZonedNow } from "@/domain/booking/types";
import { PencilIcon, TrashIcon } from "./icons";

type Props = {
  bookings: Booking[];
  /** The date being displayed. */
  date: DateString;
  /** `null` until the client clock is known: no status labels then. */
  now: ZonedNow | null;
  /** Bookings to mark as conflicting after a 409. */
  highlightIds?: string[];
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

const STRIPE_CLASS: Record<"past" | "ongoing" | "upcoming", string> = {
  past: "bg-past",
  ongoing: "bg-ongoing",
  upcoming: "bg-busy",
};

const actionClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-medium text-text hover:bg-surface-muted active:scale-[0.98] active:bg-surface-muted disabled:opacity-60 text-sm";

export function BookingList({
  bookings,
  date,
  now,
  highlightIds,
  onEdit,
  onDelete,
}: Props) {
  const sorted = [...bookings].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start),
  );
  return (
    <ul className="flex flex-col gap-3" aria-label="Бронирования на выбранную дату">
      {sorted.map((b) => {
        const status = getStatus(b, date, now);
        const conflict = highlightIds?.includes(b.id) ?? false;
        return (
          <li
            key={b.id}
            data-conflict={conflict ? "true" : undefined}
            className={`relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border bg-surface py-3 pr-4 pl-5 ${conflict ? "border-danger" : "border-border"}`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-1.5 ${STRIPE_CLASS[status ?? "upcoming"]}`}
            />
            <div className="min-w-0">
              <p
                className={`break-words font-medium ${status === "past" ? "text-muted" : "text-text"}`}
              >
                {b.title?.trim() || "Без названия"}
              </p>
              <p className="text-sm text-muted">
                <time>{b.start}</time>
                {" – "}
                <time>{b.end}</time>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    status === "ongoing"
                      ? "border-ongoing bg-surface-muted text-ongoing"
                      : "border-border bg-surface-muted text-muted"
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
                  <PencilIcon />
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
                  <TrashIcon />
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
