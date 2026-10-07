import { TITLE_MAX_LENGTH } from "./config";
import { isValidDateString, isValidTimeString } from "./time";
import type {
  BookingInput,
  Result,
  ValidationIssue,
} from "./types";

/** Format-only validation of an untrusted payload; business rules live in rules.ts. */
export function parseBookingInput(
  raw: unknown,
): Result<BookingInput, ValidationIssue[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: [{ code: "INVALID_BODY" }] };
  }
  const obj = raw as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  const { date, start, end, title } = obj;

  if (typeof date !== "string" || !isValidDateString(date)) {
    issues.push({ field: "date", code: "INVALID_DATE" });
  }
  if (typeof start !== "string" || !isValidTimeString(start)) {
    issues.push({ field: "start", code: "INVALID_TIME" });
  }
  if (typeof end !== "string" || !isValidTimeString(end)) {
    issues.push({ field: "end", code: "INVALID_TIME" });
  }

  let cleanTitle: string | undefined;
  if (title !== undefined && title !== null) {
    if (typeof title !== "string") {
      issues.push({ field: "title", code: "INVALID_TITLE" });
    } else {
      const trimmed = title.trim();
      if (trimmed.length > TITLE_MAX_LENGTH) {
        issues.push({ field: "title", code: "TITLE_TOO_LONG" });
      } else if (trimmed !== "") {
        cleanTitle = trimmed;
      }
    }
  }

  if (issues.length > 0) return { ok: false, error: issues };

  const value: BookingInput = {
    date: date as string,
    start: start as string,
    end: end as string,
  };
  if (cleanTitle !== undefined) value.title = cleanTitle;
  return { ok: true, value };
}
