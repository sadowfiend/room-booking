import { SLOT_STEP_MINUTES, WORKDAY_END, WORKDAY_START } from "./config";
import type { DateString, TimeString, ZonedNow } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDateString(s: string): s is DateString {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function isValidTimeString(s: string): s is TimeString {
  return TIME_RE.test(s);
}

/** Minutes since midnight for a valid `HH:mm` string. */
export function toMinutes(time: TimeString): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): TimeString {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Minutes out of range 0..1439: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The given instant expressed in `timeZone` as a date and minutes since midnight. */
export function getZonedNow(instant: Date, timeZone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Slot boundaries from workday start to end inclusive (09:00 … 18:00). */
export function generateTimeSlots(): TimeString[] {
  const slots: TimeString[] = [];
  const end = toMinutes(WORKDAY_END);
  for (let t = toMinutes(WORKDAY_START); t <= end; t += SLOT_STEP_MINUTES) {
    slots.push(fromMinutes(t));
  }
  return slots;
}
