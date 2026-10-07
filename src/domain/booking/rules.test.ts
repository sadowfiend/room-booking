import { describe, expect, it } from "vitest";
import { findConflicts, validateBooking } from "./rules";
import type { Booking, BookingInput, ValidationCode, ZonedNow } from "./types";

const TODAY = "2026-10-07";
const FUTURE = "2026-10-08";
const NOW: ZonedNow = { date: TODAY, minutes: 12 * 60 }; // 12:00 today

const codes = (
  input: BookingInput,
  ctx: { now: ZonedNow; original?: Booking } = { now: NOW },
): ValidationCode[] => validateBooking(input, ctx).map((i) => i.code);

const inp = (start: string, end: string, date = FUTURE): BookingInput => ({
  date,
  start,
  end,
});

describe("validateBooking: working hours", () => {
  it("accepts 09:00 start and 18:00 end", () => {
    expect(validateBooking(inp("09:00", "10:00"), { now: NOW })).toEqual([]);
    expect(validateBooking(inp("17:00", "18:00"), { now: NOW })).toEqual([]);
    expect(validateBooking(inp("09:00", "11:00"), { now: NOW })).toEqual([]);
  });
  it("rejects start 08:30", () => {
    expect(codes(inp("08:30", "09:30"))).toContain("OUTSIDE_WORKING_HOURS");
  });
  it("rejects end 18:30", () => {
    expect(codes(inp("17:30", "18:30"))).toContain("OUTSIDE_WORKING_HOURS");
  });
  it("rejects fully outside range", () => {
    expect(codes(inp("07:00", "08:00"))).toContain("OUTSIDE_WORKING_HOURS");
    expect(codes(inp("19:00", "20:00"))).toContain("OUTSIDE_WORKING_HOURS");
  });
});

describe("validateBooking: step", () => {
  it("accepts multiples of 15 (:15 and :45 are on-step)", () => {
    expect(codes(inp("10:30", "11:30"))).toEqual([]);
    expect(codes(inp("10:15", "11:00"))).toEqual([]);
    expect(codes(inp("10:00", "10:45"))).toEqual([]);
    expect(codes(inp("10:45", "11:45"))).toEqual([]);
  });
  it("rejects off-step start and end", () => {
    expect(codes(inp("10:10", "11:00"))).toContain("OFF_STEP");
    expect(codes(inp("10:00", "11:10"))).toContain("OFF_STEP");
  });
});

describe("validateBooking: order and duration", () => {
  it("start == end -> START_NOT_BEFORE_END only, no duration codes", () => {
    const c = codes(inp("10:00", "10:00"));
    expect(c).toContain("START_NOT_BEFORE_END");
    expect(c).not.toContain("TOO_SHORT");
    expect(c).not.toContain("TOO_LONG");
  });
  it("start > end -> START_NOT_BEFORE_END, no duration codes", () => {
    const c = codes(inp("12:00", "10:00"));
    expect(c).toContain("START_NOT_BEFORE_END");
    expect(c).not.toContain("TOO_SHORT");
    expect(c).not.toContain("TOO_LONG");
  });
  it("30 minutes is valid", () => {
    expect(codes(inp("10:00", "10:30"))).toEqual([]);
  });
  it("120 minutes is valid", () => {
    expect(codes(inp("10:00", "12:00"))).toEqual([]);
  });
  it("45 minutes is valid", () => {
    expect(codes(inp("10:00", "10:45"))).toEqual([]);
  });
  it("29 minutes -> exactly OFF_STEP on end, no TOO_SHORT", () => {
    const issues = validateBooking(inp("10:00", "10:29"), { now: NOW });
    expect(issues).toEqual([{ field: "end", code: "OFF_STEP" }]);
  });
  it("40 minutes -> exactly OFF_STEP on end, no TOO_SHORT", () => {
    const issues = validateBooking(inp("10:00", "10:40"), { now: NOW });
    expect(issues).toEqual([{ field: "end", code: "OFF_STEP" }]);
  });
  it("121 minutes -> exactly OFF_STEP, no TOO_LONG", () => {
    const issues = validateBooking(inp("10:00", "12:01"), { now: NOW });
    expect(issues.map((i) => i.code)).toEqual(["OFF_STEP"]);
  });
  it("off-step start alone -> OFF_STEP on start, no duration code", () => {
    const issues = validateBooking(inp("10:10", "11:00"), { now: NOW });
    expect(issues).toEqual([{ field: "start", code: "OFF_STEP" }]);
  });
  it("150 minutes is too long", () => {
    expect(codes(inp("10:00", "12:30"))).toContain("TOO_LONG");
  });
});

describe("validateBooking: past", () => {
  it("past date -> PAST_DATE", () => {
    expect(codes(inp("10:00", "11:00", "2026-10-06"))).toContain("PAST_DATE");
  });
  it("future date is fine regardless of time of day", () => {
    expect(codes(inp("09:00", "10:00", FUTURE))).toEqual([]);
  });
  it("today start == now is valid", () => {
    expect(codes(inp("12:00", "13:00", TODAY))).toEqual([]);
  });
  it("today start 11:30 < now 12:00 -> START_IN_PAST without END_IN_PAST", () => {
    const c = codes(inp("11:30", "13:00", TODAY));
    expect(c).toContain("START_IN_PAST");
    expect(c).not.toContain("END_IN_PAST");
  });
  it("today entirely in the past -> START_IN_PAST only", () => {
    const c = codes(inp("10:00", "11:00", TODAY));
    expect(c).toContain("START_IN_PAST");
    expect(c).not.toContain("END_IN_PAST");
  });
  it("today start one step after now is valid", () => {
    expect(codes(inp("12:30", "13:00", TODAY))).toEqual([]);
  });
  it("today does not report PAST_DATE", () => {
    expect(codes(inp("10:00", "11:00", TODAY))).not.toContain("PAST_DATE");
  });
});

describe("validateBooking: edit with original", () => {
  const ongoing: Booking = {
    id: "a",
    date: TODAY,
    start: "11:00",
    end: "13:00",
  };

  it("finished original (end <= now) -> exactly BOOKING_FINISHED", () => {
    const finished: Booking = { id: "f", date: TODAY, start: "10:00", end: "11:00" };
    expect(
      validateBooking(inp("14:00", "15:00", TODAY), { now: NOW, original: finished }),
    ).toEqual([{ code: "BOOKING_FINISHED" }]);
  });
  it("original ending exactly at now is finished", () => {
    const o: Booking = { id: "f", date: TODAY, start: "11:00", end: "12:00" };
    expect(
      validateBooking(inp("14:00", "15:00", TODAY), { now: NOW, original: o }),
    ).toEqual([{ code: "BOOKING_FINISHED" }]);
  });
  it("original on an earlier date is finished", () => {
    const o: Booking = { id: "f", date: "2026-10-06", start: "10:00", end: "11:00" };
    expect(
      validateBooking(inp("10:00", "11:00", FUTURE), { now: NOW, original: o }),
    ).toEqual([{ code: "BOOKING_FINISHED" }]);
  });
  it("original ending one step after now is ongoing, not finished", () => {
    const o: Booking = { id: "o", date: TODAY, start: "11:00", end: "12:30" };
    expect(
      codes(inp("11:00", "12:30", TODAY), { now: NOW, original: o }),
    ).toEqual([]);
  });
  it("ongoing: keeping date and start is valid even though start < now", () => {
    expect(
      validateBooking(inp("11:00", "13:00", TODAY), { now: NOW, original: ongoing }),
    ).toEqual([]);
    expect(
      validateBooking(inp("11:00", "12:30", TODAY), { now: NOW, original: ongoing }),
    ).toEqual([]);
  });
  it("ongoing: moving start into the past -> START_IN_PAST", () => {
    expect(
      codes(inp("10:30", "13:00", TODAY), { now: NOW, original: ongoing }),
    ).toContain("START_IN_PAST");
  });
  it("ongoing: end <= now with kept start -> END_IN_PAST", () => {
    expect(
      codes(inp("11:00", "11:30", TODAY), { now: NOW, original: ongoing }),
    ).toContain("END_IN_PAST");
    expect(
      codes(inp("11:00", "12:00", TODAY), { now: NOW, original: ongoing }),
    ).toContain("END_IN_PAST");
  });
  it("ongoing: moving to a future date is valid", () => {
    expect(
      validateBooking(inp("11:00", "12:00", FUTURE), { now: NOW, original: ongoing }),
    ).toEqual([]);
  });
  it("future original can be edited like a new booking", () => {
    const o: Booking = { id: "x", date: FUTURE, start: "10:00", end: "11:00" };
    expect(
      validateBooking(inp("14:00", "15:00", FUTURE), { now: NOW, original: o }),
    ).toEqual([]);
    expect(
      codes(inp("14:00", "16:30", FUTURE), { now: NOW, original: o }),
    ).toContain("TOO_LONG");
  });
});

describe("findConflicts", () => {
  const mk = (id: string, start: string, end: string, date = FUTURE): Booking => ({
    id,
    date,
    start,
    end,
  });
  const existing = [mk("a", "10:00", "11:00")];

  it("touching borders are not a conflict", () => {
    expect(findConflicts(inp("11:00", "12:00"), existing)).toEqual([]);
    expect(findConflicts(inp("09:00", "10:00"), existing)).toEqual([]);
  });
  it("identical interval conflicts", () => {
    expect(findConflicts(inp("10:00", "11:00"), existing)).toEqual(existing);
  });
  it("partial overlap on either side conflicts", () => {
    expect(findConflicts(inp("10:30", "11:30"), existing)).toHaveLength(1);
    expect(findConflicts(inp("09:30", "10:30"), existing)).toHaveLength(1);
  });
  it("nested intervals conflict in both directions", () => {
    expect(findConflicts(inp("10:00", "10:30"), existing)).toHaveLength(1);
    expect(findConflicts(inp("10:30", "11:00"), existing)).toHaveLength(1);
    expect(findConflicts(inp("09:00", "12:00"), existing)).toHaveLength(1);
  });
  it("ignores other dates", () => {
    expect(
      findConflicts(inp("10:00", "11:00", "2026-10-09"), existing),
    ).toEqual([]);
  });
  it("returns all conflicting bookings", () => {
    const list = [mk("a", "10:00", "11:00"), mk("b", "11:00", "12:00"), mk("c", "13:00", "14:00")];
    expect(findConflicts(inp("10:30", "11:30"), list).map((b) => b.id)).toEqual(["a", "b"]);
  });
  it("excludeId skips own booking", () => {
    expect(findConflicts(inp("10:00", "11:00"), existing, "a")).toEqual([]);
  });
  it("excludeId does not hide other bookings", () => {
    const list = [mk("a", "10:00", "11:00"), mk("b", "10:30", "11:30")];
    expect(findConflicts(inp("10:00", "11:00"), list, "a").map((b) => b.id)).toEqual(["b"]);
  });
  it("empty list yields no conflicts", () => {
    expect(findConflicts(inp("10:00", "11:00"), [])).toEqual([]);
  });
});
