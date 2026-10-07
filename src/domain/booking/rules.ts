import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  SLOT_STEP_MINUTES,
  WORKDAY_END,
  WORKDAY_START,
} from "./config";
import { toMinutes } from "./time";
import type {
  Booking,
  BookingInput,
  ValidationIssue,
  ZonedNow,
} from "./types";

/**
 * Rules 1-4, 6 and the edit/ongoing rules. Does not check overlaps.
 * Server order: 422 from validateBooking first, then 409 from findConflicts.
 */
export function validateBooking(
  input: BookingInput,
  ctx: { now: ZonedNow; original?: Booking },
): ValidationIssue[] {
  const { now, original } = ctx;
  const start = toMinutes(input.start);
  const end = toMinutes(input.end);

  if (original) {
    const finished =
      original.date < now.date ||
      (original.date === now.date && toMinutes(original.end) <= now.minutes);
    if (finished) return [{ code: "BOOKING_FINISHED" }];
  }

  const issues: ValidationIssue[] = [];

  const startOffStep = start % SLOT_STEP_MINUTES !== 0;
  const endOffStep = end % SLOT_STEP_MINUTES !== 0;
  if (startOffStep) issues.push({ field: "start", code: "OFF_STEP" });
  if (endOffStep) issues.push({ field: "end", code: "OFF_STEP" });

  const dayStart = toMinutes(WORKDAY_START);
  const dayEnd = toMinutes(WORKDAY_END);
  if (start < dayStart || start > dayEnd) {
    issues.push({ field: "start", code: "OUTSIDE_WORKING_HOURS" });
  }
  if (end < dayStart || end > dayEnd) {
    issues.push({ field: "end", code: "OUTSIDE_WORKING_HOURS" });
  }

  if (start >= end) {
    issues.push({ field: "end", code: "START_NOT_BEFORE_END" });
  } else if (!startOffStep && !endOffStep) {
    const duration = end - start;
    if (duration < MIN_DURATION_MINUTES) {
      issues.push({ field: "end", code: "TOO_SHORT" });
    } else if (duration > MAX_DURATION_MINUTES) {
      issues.push({ field: "end", code: "TOO_LONG" });
    }
  }

  if (input.date < now.date) {
    issues.push({ field: "date", code: "PAST_DATE" });
  } else if (input.date === now.date) {
    const originalOngoing =
      original !== undefined &&
      original.date === now.date &&
      toMinutes(original.start) <= now.minutes;
    const startUnchanged = originalOngoing && input.start === original.start;
    const startInPast = start < now.minutes && !startUnchanged;
    if (startInPast) {
      issues.push({ field: "start", code: "START_IN_PAST" });
    }
    if (!startInPast && end <= now.minutes) {
      issues.push({ field: "end", code: "END_IN_PAST" });
    }
  }

  return issues;
}

/** Rules 5 and 7: bookings overlapping [start, end) on the same date, skipping `excludeId`. */
export function findConflicts(
  input: BookingInput,
  existing: Booking[],
  excludeId?: string,
): Booking[] {
  const start = toMinutes(input.start);
  const end = toMinutes(input.end);
  return existing.filter(
    (b) =>
      b.id !== excludeId &&
      b.date === input.date &&
      toMinutes(b.start) < end &&
      start < toMinutes(b.end),
  );
}
