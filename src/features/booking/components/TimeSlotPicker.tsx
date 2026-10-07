import { useId, useMemo } from "react";
import { getSlotAvailability } from "@/domain/booking/availability";
import {
  END_REASON_LABELS,
  SLOT_REASON_LABELS,
  TIME_HINT_MESSAGE,
} from "@/domain/booking/messages";
import { findConflicts, validateBooking } from "@/domain/booking/rules";
import { generateTimeSlots } from "@/domain/booking/time";
import type {
  Booking,
  DateString,
  TimeString,
  ZonedNow,
} from "@/domain/booking/types";

type Props = {
  date: DateString;
  /** Bookings already on `date`. */
  existing: Booking[];
  now: ZonedNow;
  /** The booking being edited: its own slots are not busy. */
  original?: Booking;
  /** Selected values; empty string means nothing selected yet. */
  start: TimeString | "";
  end: TimeString | "";
  onStartChange: (start: TimeString | "") => void;
  onEndChange: (end: TimeString | "") => void;
  startError?: string;
  endError?: string;
  disabled?: boolean;
};

const selectClass =
  "w-full rounded-md border bg-white px-3 py-2 text-base text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60";

export function TimeSlotPicker({
  date,
  existing,
  now,
  original,
  start,
  end,
  onStartChange,
  onEndChange,
  startError,
  endError,
  disabled,
}: Props) {
  const id = useId();
  const startId = `${id}-start`;
  const endId = `${id}-end`;
  const hintId = `${id}-hint`;
  const startErrorId = `${id}-start-error`;
  const endErrorId = `${id}-end-error`;

  // Grid has 37 points: start cannot be the last one, end cannot be the first.
  const points = useMemo(() => generateTimeSlots(), []);
  const startPoints = points.slice(0, -1);
  const endPoints = points.slice(1);

  const availability = useMemo(
    () => getSlotAvailability(date, { existing, now, original }),
    [date, existing, now, original],
  );

  const startLabel = (time: TimeString): { text: string; unavailable: boolean } => {
    const slot = availability.find((a) => a.start === time);
    if (!slot || slot.status === "available") {
      return { text: time, unavailable: false };
    }
    const reason =
      slot.status === "busy" ? SLOT_REASON_LABELS.BUSY : SLOT_REASON_LABELS.PAST;
    return { text: `${time} — ${reason}`, unavailable: true };
  };

  const endLabel = (time: TimeString): { text: string; unavailable: boolean } => {
    if (start === "") return { text: time, unavailable: false };
    const input = { date, start, end: time };
    const issue = validateBooking(input, { now, original }).find(
      (i) => i.field === "end" || i.field === undefined,
    );
    if (issue) {
      const reason = END_REASON_LABELS[issue.code] ?? SLOT_REASON_LABELS.PAST;
      return { text: `${time} — ${reason}`, unavailable: true };
    }
    if (findConflicts(input, existing, original?.id).length > 0) {
      return {
        text: `${time} — ${SLOT_REASON_LABELS.BUSY}`,
        unavailable: true,
      };
    }
    return { text: time, unavailable: false };
  };

  const describedBy = (errorId: string, error?: string) =>
    error ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={startId} className="text-sm font-medium text-zinc-700">
          Начало
        </label>
        <select
          id={startId}
          value={start}
          disabled={disabled}
          aria-invalid={startError ? true : undefined}
          aria-describedby={describedBy(startErrorId, startError)}
          onChange={(e) => onStartChange(e.target.value)}
          className={`${selectClass} ${startError ? "border-red-500" : "border-zinc-300"}`}
        >
          <option value="">Выберите время</option>
          {startPoints.map((t) => {
            const { text, unavailable } = startLabel(t);
            return (
              <option key={t} value={t} disabled={unavailable}>
                {text}
              </option>
            );
          })}
        </select>
        {startError ? (
          <p id={startErrorId} className="text-sm text-red-700">
            {startError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={endId} className="text-sm font-medium text-zinc-700">
          Окончание
        </label>
        <select
          id={endId}
          value={end}
          disabled={disabled}
          aria-invalid={endError ? true : undefined}
          aria-describedby={describedBy(endErrorId, endError)}
          onChange={(e) => onEndChange(e.target.value)}
          className={`${selectClass} ${endError ? "border-red-500" : "border-zinc-300"}`}
        >
          <option value="">Выберите время</option>
          {endPoints.map((t) => {
            const { text, unavailable } = endLabel(t);
            return (
              <option key={t} value={t} disabled={unavailable}>
                {text}
              </option>
            );
          })}
        </select>
        {endError ? (
          <p id={endErrorId} className="text-sm text-red-700">
            {endError}
          </p>
        ) : null}
      </div>

      <p id={hintId} className="text-xs text-zinc-600 sm:col-span-2">
        {TIME_HINT_MESSAGE}
      </p>
    </div>
  );
}
