import { WORKDAY_END, WORKDAY_START } from "@/domain/booking/config";
import { toMinutes } from "@/domain/booking/time";
import type { Booking, DateString, ZonedNow } from "@/domain/booking/types";

type Props = {
  bookings: Booking[];
  date: DateString;
  /** `null` until the client clock is known. */
  now: ZonedNow | null;
};

const DAY_START = toMinutes(WORKDAY_START);
const DAY_SPAN = toMinutes(WORKDAY_END) - DAY_START;

/** Position on the strip in percent, clamped to the working day. */
function pct(minutes: number): number {
  const p = ((minutes - DAY_START) / DAY_SPAN) * 100;
  return Math.min(100, Math.max(0, p));
}

/** Decorative overview of the working day: busy segments, past shading, "now" line. */
export function DayStrip({ bookings, date, now }: Props) {
  const isToday = now !== null && now.date === date;
  return (
    <div
      aria-hidden="true"
      className="relative h-3 w-full overflow-hidden rounded-full border border-border bg-surface-muted"
    >
      {isToday ? (
        <div
          data-part="past"
          className="absolute inset-y-0 left-0 bg-past opacity-40"
          style={{ width: `${pct(now.minutes)}%` }}
        />
      ) : null}
      {bookings.map((b) => {
        const left = pct(toMinutes(b.start));
        const right = pct(toMinutes(b.end));
        return (
          <div
            key={b.id}
            data-part="booking"
            className="absolute inset-y-0 bg-busy"
            style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
          />
        );
      })}
      {isToday && now.minutes >= DAY_START && now.minutes <= DAY_START + DAY_SPAN ? (
        <div
          data-part="now"
          className="absolute inset-y-0 w-0.5 bg-danger"
          style={{ left: `${pct(now.minutes)}%` }}
        />
      ) : null}
    </div>
  );
}
