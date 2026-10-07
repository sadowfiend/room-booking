import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_TIME_ZONE,
  resolveRoomTimeZone,
  SLOT_STEP_MINUTES,
  WORKDAY_END,
  WORKDAY_START,
} from "./config";
import {
  fromMinutes,
  generateTimeSlots,
  getZonedNow,
  isValidDateString,
  toMinutes,
} from "./time";

describe("getZonedNow (Asia/Bishkek, UTC+6)", () => {
  it("rolls over to next day at 18:00Z", () => {
    expect(getZonedNow(new Date("2026-10-07T18:00:00Z"), "Asia/Bishkek")).toEqual({
      date: "2026-10-08",
      minutes: 0,
    });
  });
  it("stays on the same day at 17:59Z", () => {
    expect(getZonedNow(new Date("2026-10-07T17:59:00Z"), "Asia/Bishkek")).toEqual({
      date: "2026-10-07",
      minutes: 1439,
    });
  });
  it("converts midday", () => {
    expect(getZonedNow(new Date("2026-10-07T04:30:00Z"), "Asia/Bishkek")).toEqual({
      date: "2026-10-07",
      minutes: 630,
    });
  });
});

describe("isValidDateString", () => {
  it.each([
    ["2026-02-30", false],
    ["2028-02-29", true],
    ["2026-02-29", false],
    ["2026-13-01", false],
    ["2026-1-01", false],
    ["", false],
    ["2026-10-07", true],
  ])("%s -> %s", (s, expected) => {
    expect(isValidDateString(s)).toBe(expected);
  });
});

describe("toMinutes / fromMinutes", () => {
  it("converts both ways", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("18:00")).toBe(1080);
    expect(fromMinutes(0)).toBe("00:00");
    expect(fromMinutes(570)).toBe("09:30");
    expect(fromMinutes(1080)).toBe("18:00");
  });
});

describe("generateTimeSlots", () => {
  it("has 37 slots from 09:00 to 18:00 in 15 min steps", () => {
    const slots = generateTimeSlots();
    expect(slots).toHaveLength(37);
    expect(slots[0]).toBe("09:00");
    expect(slots[1]).toBe("09:15");
    expect(slots[36]).toBe("18:00");
    const span = toMinutes(WORKDAY_END) - toMinutes(WORKDAY_START);
    expect(slots).toHaveLength(span / SLOT_STEP_MINUTES + 1);
    slots.forEach((s, i) => {
      expect(toMinutes(s)).toBe(toMinutes(WORKDAY_START) + i * SLOT_STEP_MINUTES);
    });
  });
});

describe("resolveRoomTimeZone", () => {
  it("falls back to default for invalid or missing value", () => {
    expect(resolveRoomTimeZone("Not/AZone")).toBe("Asia/Bishkek");
    expect(resolveRoomTimeZone(undefined)).toBe("Asia/Bishkek");
    expect(DEFAULT_ROOM_TIME_ZONE).toBe("Asia/Bishkek");
  });
  it("returns a valid zone as is", () => {
    expect(resolveRoomTimeZone("Europe/Moscow")).toBe("Europe/Moscow");
  });
});
