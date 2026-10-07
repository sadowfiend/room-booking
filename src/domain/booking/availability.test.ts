import { describe, expect, it } from "vitest";
import { getSlotAvailability } from "./availability";
import { SLOT_STEP_MINUTES } from "./config";
import { fromMinutes, toMinutes } from "./time";
import type { Booking, ZonedNow } from "./types";

const TODAY = "2026-10-07";
const FUTURE = "2026-10-08";
const PAST = "2026-10-06";
const at = (h: number, m = 0): ZonedNow => ({ date: TODAY, minutes: h * 60 + m });
const NOW = at(12);
const bk = (id: string, start: string, end: string, date = FUTURE): Booking => ({
  id,
  date,
  start,
  end,
});
const find = (r: ReturnType<typeof getSlotAvailability>, start: string) =>
  r.find((c) => c.start === start)!;

describe("getSlotAvailability: shape", () => {
  it("returns 36 cells from 09:00-09:15 to 17:45-18:00, all available on a free future date", () => {
    const r = getSlotAvailability(FUTURE, { existing: [], now: NOW });
    expect(r).toHaveLength(36);
    expect(r[0]).toMatchObject({ start: "09:00", end: "09:15" });
    expect(r[35]).toMatchObject({ start: "17:45", end: "18:00" });
    for (const c of r) {
      expect(toMinutes(c.end) - toMinutes(c.start)).toBe(SLOT_STEP_MINUTES);
    }
    expect(r[1].start).toBe(fromMinutes(toMinutes("09:00") + SLOT_STEP_MINUTES));
    expect(r.every((c) => c.status === "available")).toBe(true);
  });
});

describe("getSlotAvailability: past", () => {
  it("past date -> all past with PAST_DATE", () => {
    const r = getSlotAvailability(PAST, { existing: [], now: NOW });
    expect(r).toHaveLength(36);
    for (const c of r) expect(c).toMatchObject({ status: "past", code: "PAST_DATE" });
  });
  it("today, now 12:00: earlier cells past, 12:00 cell available", () => {
    const r = getSlotAvailability(TODAY, { existing: [], now: NOW });
    for (const c of r) {
      if (c.start < "12:00") {
        expect(c).toMatchObject({ status: "past", code: "START_IN_PAST" });
      } else {
        expect(c.status).toBe("available");
      }
    }
    expect(find(r, "11:45").status).toBe("past");
    expect(find(r, "12:00").status).toBe("available");
  });
  it("today, now 12:10: 12:00 cell past, 12:15 available", () => {
    const r = getSlotAvailability(TODAY, { existing: [], now: at(12, 10) });
    expect(find(r, "12:00")).toMatchObject({ status: "past", code: "START_IN_PAST" });
    expect(find(r, "12:15").status).toBe("available");
  });
});

describe("getSlotAvailability: busy", () => {
  const b = bk("a", "10:00", "11:00");
  it("booking 10:00-11:00 makes exactly 10:00, 10:15, 10:30, 10:45 busy; touching cells free", () => {
    const r = getSlotAvailability(FUTURE, { existing: [b], now: NOW });
    const busy = r.filter((c) => c.status === "busy").map((c) => c.start);
    expect(busy).toEqual(["10:00", "10:15", "10:30", "10:45"]);
    for (const s of ["10:00", "10:15", "10:30", "10:45"]) {
      expect(find(r, s)).toMatchObject({ status: "busy", conflicts: [b] });
    }
    expect(find(r, "09:45").status).toBe("available");
    expect(find(r, "11:00").status).toBe("available");
  });
  it("bookings on other dates do not affect the result", () => {
    const other = bk("o", "10:00", "11:00", "2026-10-09");
    const r = getSlotAvailability(FUTURE, { existing: [other], now: NOW });
    expect(r.every((c) => c.status === "available")).toBe(true);
  });
  it("past wins over busy", () => {
    const t = bk("t", "10:00", "11:00", TODAY);
    const r = getSlotAvailability(TODAY, { existing: [t], now: NOW });
    expect(find(r, "10:00")).toMatchObject({ status: "past", code: "START_IN_PAST" });
    expect(find(r, "10:30")).toMatchObject({ status: "past", code: "START_IN_PAST" });
  });
});

describe("getSlotAvailability: edit with original", () => {
  it("own cells are not busy; another booking still is", () => {
    const own = bk("a", "10:00", "11:00");
    const other = bk("b", "14:00", "15:00");
    const r = getSlotAvailability(FUTURE, {
      existing: [own, other],
      now: NOW,
      original: own,
    });
    expect(find(r, "10:00").status).toBe("available");
    expect(find(r, "10:30").status).toBe("available");
    expect(find(r, "14:00")).toMatchObject({ status: "busy", conflicts: [other] });
    expect(find(r, "14:30")).toMatchObject({ status: "busy", conflicts: [other] });
  });
  it("ongoing original: start cell not past, later started cell past", () => {
    const o = bk("o", "10:00", "11:30", TODAY);
    const r = getSlotAvailability(TODAY, { existing: [o], now: at(10, 40), original: o });
    expect(find(r, "10:00").status).not.toBe("past");
    expect(find(r, "10:15")).toMatchObject({ status: "past", code: "START_IN_PAST" });
    expect(find(r, "10:30")).toMatchObject({ status: "past", code: "START_IN_PAST" });
    expect(find(r, "10:45").status).toBe("available");
  });
  it("finished original -> every cell past with BOOKING_FINISHED", () => {
    const o = bk("f", "09:00", "10:00", TODAY);
    const r = getSlotAvailability(TODAY, { existing: [o], now: NOW, original: o });
    expect(r).toHaveLength(36);
    for (const c of r) expect(c).toMatchObject({ status: "past", code: "BOOKING_FINISHED" });
  });
});
