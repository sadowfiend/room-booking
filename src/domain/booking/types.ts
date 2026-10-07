/** Calendar date, format `YYYY-MM-DD`. */
export type DateString = string;

/** Time of day, format `HH:mm` (24h). */
export type TimeString = string;

export type Booking = {
  id: string;
  date: DateString;
  start: TimeString;
  end: TimeString;
  title?: string;
};

export type BookingInput = Omit<Booking, "id">;

/** "Now" in the room time zone; `minutes` is minutes since midnight. */
export type ZonedNow = { date: DateString; minutes: number };

export type BookingField = "date" | "start" | "end" | "title";

export type ValidationCode =
  /** Body is not an object or fields have wrong types. */
  | "INVALID_BODY"
  /** Date is missing, malformed or not a real calendar date. */
  | "INVALID_DATE"
  /** Start or end is missing or not a valid HH:mm time (format only). */
  | "INVALID_TIME"
  /** Start or end is not aligned to the slot step. */
  | "OFF_STEP"
  /** Title is present but not a string. */
  | "INVALID_TITLE"
  /** Title exceeds the maximum length. */
  | "TITLE_TOO_LONG"
  /** Start or end lies outside the working day. */
  | "OUTSIDE_WORKING_HOURS"
  /** Start is not strictly before end. */
  | "START_NOT_BEFORE_END"
  /** Duration is below the minimum. */
  | "TOO_SHORT"
  /** Duration is above the maximum. */
  | "TOO_LONG"
  /** Date is before today in the room time zone. */
  | "PAST_DATE"
  /** Start is earlier than now. */
  | "START_IN_PAST"
  /** End is not after now (ongoing booking edit). */
  | "END_IN_PAST"
  /** Booking has already finished and cannot be changed. */
  | "BOOKING_FINISHED";

export type ValidationIssue = { field?: BookingField; code: ValidationCode };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
