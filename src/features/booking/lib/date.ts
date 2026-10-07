import type { DateString } from "@/domain/booking/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Shifts a `YYYY-MM-DD` date by `delta` calendar days (UTC arithmetic, no DST). */
export function addDays(date: DateString, delta: number): DateString {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + delta * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}
