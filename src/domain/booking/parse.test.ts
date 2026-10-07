import { describe, expect, it } from "vitest";
import { TITLE_MAX_LENGTH } from "./config";
import { parseBookingInput } from "./parse";

const valid = { date: "2026-10-08", start: "10:00", end: "11:00" };

describe("parseBookingInput", () => {
  it("accepts a valid payload without title", () => {
    expect(parseBookingInput(valid)).toEqual({ ok: true, value: valid });
  });

  it.each([null, [], [valid], "str", 42, undefined, true])(
    "rejects non-object body %j",
    (raw) => {
      expect(parseBookingInput(raw)).toEqual({
        ok: false,
        error: [{ code: "INVALID_BODY" }],
      });
    },
  );

  it("reports all missing fields", () => {
    const r = parseBookingInput({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual(
        expect.arrayContaining([
          { field: "date", code: "INVALID_DATE" },
          { field: "start", code: "INVALID_TIME" },
          { field: "end", code: "INVALID_TIME" },
        ]),
      );
      expect(r.error).toHaveLength(3);
    }
  });

  it.each(["2026-02-30", "2026-10-7", "garbage", "", 20261007, null])(
    "rejects date %j",
    (date) => {
      const r = parseBookingInput({ ...valid, date });
      expect(r).toEqual({
        ok: false,
        error: [{ field: "date", code: "INVALID_DATE" }],
      });
    },
  );

  it.each(["9:00", "24:00", "10:60", "10:00:00", "", 900, null])(
    "rejects time %j",
    (t) => {
      expect(parseBookingInput({ ...valid, start: t })).toEqual({
        ok: false,
        error: [{ field: "start", code: "INVALID_TIME" }],
      });
      expect(parseBookingInput({ ...valid, end: t })).toEqual({
        ok: false,
        error: [{ field: "end", code: "INVALID_TIME" }],
      });
    },
  );

  it("accepts 00:00 and 23:59 as format-valid", () => {
    expect(
      parseBookingInput({ ...valid, start: "00:00", end: "23:59" }).ok,
    ).toBe(true);
  });

  it("rejects non-string title", () => {
    for (const title of [123, {}, [], true]) {
      expect(parseBookingInput({ ...valid, title })).toEqual({
        ok: false,
        error: [{ field: "title", code: "INVALID_TITLE" }],
      });
    }
  });

  it("trims the title", () => {
    expect(parseBookingInput({ ...valid, title: "  Sync  " })).toEqual({
      ok: true,
      value: { ...valid, title: "Sync" },
    });
  });

  it("omits empty and whitespace-only title", () => {
    for (const title of ["", "   ", "\t\n"]) {
      const r = parseBookingInput({ ...valid, title });
      expect(r).toEqual({ ok: true, value: valid });
      if (r.ok) expect("title" in r.value).toBe(false);
    }
  });

  it("title of exactly max length is valid, one more is too long", () => {
    const ok = "a".repeat(TITLE_MAX_LENGTH);
    expect(parseBookingInput({ ...valid, title: ok }).ok).toBe(true);
    expect(parseBookingInput({ ...valid, title: "a".repeat(101) })).toEqual({
      ok: false,
      error: [{ field: "title", code: "TITLE_TOO_LONG" }],
    });
  });

  it("measures title length after trimming", () => {
    const title = ` ${"a".repeat(TITLE_MAX_LENGTH)} `;
    expect(parseBookingInput({ ...valid, title }).ok).toBe(true);
  });

  it("ignores extra fields", () => {
    expect(parseBookingInput({ ...valid, id: "x", foo: 1 })).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("collects issues from several fields", () => {
    const r = parseBookingInput({ date: "bad", start: "9:00", end: "10:00", title: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual(
        expect.arrayContaining([
          { field: "date", code: "INVALID_DATE" },
          { field: "start", code: "INVALID_TIME" },
          { field: "title", code: "INVALID_TITLE" },
        ]),
      );
      expect(r.error).toHaveLength(3);
    }
  });
});
