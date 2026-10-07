import { describe, expect, it } from "vitest";
import { getValidationMessage, VALIDATION_MESSAGES } from "./messages";
import type { ValidationCode } from "./types";

const ALL_CODES: ValidationCode[] = [
  "INVALID_BODY",
  "INVALID_DATE",
  "INVALID_TIME",
  "OFF_STEP",
  "INVALID_TITLE",
  "TITLE_TOO_LONG",
  "OUTSIDE_WORKING_HOURS",
  "START_NOT_BEFORE_END",
  "TOO_SHORT",
  "TOO_LONG",
  "PAST_DATE",
  "START_IN_PAST",
  "END_IN_PAST",
  "BOOKING_FINISHED",
];

describe("validation messages", () => {
  it.each(ALL_CODES)("%s has a non-empty Russian text", (code) => {
    const text = getValidationMessage(code);
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toMatch(/[А-Яа-яЁё]/);
    expect(VALIDATION_MESSAGES[code]).toBe(text);
  });

  it("has no extra codes", () => {
    expect(Object.keys(VALIDATION_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
  });
});
