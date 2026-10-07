import { SLOT_STEP_MINUTES } from "./config";
import { findConflicts, validateBooking } from "./rules";
import { fromMinutes, generateTimeSlots, toMinutes } from "./time";
import type { Booking, DateString, TimeString, ZonedNow } from "./types";

export type SlotPastCode = "PAST_DATE" | "START_IN_PAST" | "BOOKING_FINISHED";

export type SlotAvailability =
  | { start: TimeString; end: TimeString; status: "available" }
  | { start: TimeString; end: TimeString; status: "past"; code: SlotPastCode }
  | { start: TimeString; end: TimeString; status: "busy"; conflicts: Booking[] };

const PAST_PRIORITY: SlotPastCode[] = [
  "BOOKING_FINISHED",
  "PAST_DATE",
  "START_IN_PAST",
];

/** Status of every slot cell [t, t + step) of the working day. Past wins over busy. */
export function getSlotAvailability(
  date: DateString,
  ctx: { existing: Booking[]; now: ZonedNow; original?: Booking },
): SlotAvailability[] {
  const { existing, now, original } = ctx;
  return generateTimeSlots()
    .slice(0, -1)
    .map((start) => {
      const end = fromMinutes(toMinutes(start) + SLOT_STEP_MINUTES);
      const cell = { date, start, end };
      const codes = validateBooking(cell, { now, original }).map((i) => i.code);
      const code = PAST_PRIORITY.find((c) => codes.includes(c));
      if (code) return { start, end, status: "past", code };
      const conflicts = findConflicts(cell, existing, original?.id);
      if (conflicts.length > 0) return { start, end, status: "busy", conflicts };
      return { start, end, status: "available" };
    });
}
