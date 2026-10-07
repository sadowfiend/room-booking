import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKINGS_PATH, FORCE_CONFLICT_HEADER } from "@/lib/api/contract";
import type { ApiErrorBody, ListBookingsResponse } from "@/lib/api/contract";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

type Collection = typeof import("@/app/api/bookings/route");
type Item = typeof import("@/app/api/bookings/[id]/route");

const URL_BASE = `http://localhost${BOOKINGS_PATH}`;
const DATE = "2099-01-05";
const JSON_HEADERS = { "content-type": "application/json" };

let collection: Collection;
let item: Item;

beforeEach(async () => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("room-booking.memory-repository")];
  vi.resetModules();
  collection = await import("@/app/api/bookings/route");
  item = await import("@/app/api/bookings/[id]/route");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  collection.POST(
    new Request(URL_BASE, {
      method: "POST",
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify(payload),
    }),
  );
const patch = (id: string, payload: unknown, headers: Record<string, string> = {}) =>
  item.PATCH(
    new Request(`${URL_BASE}/${id}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id }) },
  );
const del = (id: string) =>
  item.DELETE(new Request(`${URL_BASE}/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
const list = (date: string | null) =>
  collection.GET(new Request(date === null ? URL_BASE : `${URL_BASE}?date=${date}`));

const slot = (start: string, end: string, date = DATE, extra: object = {}) => ({
  date,
  start,
  end,
  ...extra,
});

async function created(start: string, end: string, date = DATE): Promise<Booking> {
  const res = await post(slot(start, end, date));
  expect(res.status).toBe(201);
  return res.json();
}

function expectNoStore(res: Response) {
  expect(res.headers.get("Cache-Control")).toBe("no-store");
}

describe("GET /api/bookings", () => {
  it("200 with empty list", async () => {
    const res = await list(DATE);
    expect(res.status).toBe(200);
    expectNoStore(res);
    expect(await res.json()).toEqual({ bookings: [] } satisfies ListBookingsResponse);
  });

  it("200 sorted by start, only the requested date", async () => {
    await created("14:00", "15:00");
    await created("09:00", "10:00");
    await created("09:00", "10:00", "2099-01-06");
    const res = await list(DATE);
    const data = (await res.json()) as ListBookingsResponse;
    expect(data.bookings.map((b) => b.start)).toEqual(["09:00", "14:00"]);
  });

  it.each([[null], ["garbage"], ["2099-02-30"]])("date=%j → 422 VALIDATION", async (d) => {
    const res = await list(d);
    expect(res.status).toBe(422);
    expectNoStore(res);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe("VALIDATION");
    expect(body.message).toBe(API_ERROR_MESSAGES.VALIDATION);
    expect(body.errors).toEqual([{ field: "date", code: "INVALID_DATE" }]);
  });
});

describe("POST /api/bookings", () => {
  it("201 with the created Booking", async () => {
    const res = await post(slot("10:00", "11:00", DATE, { title: "Sync" }));
    expect(res.status).toBe(201);
    expectNoStore(res);
    const b = (await res.json()) as Booking;
    expect(b).toMatchObject({ date: DATE, start: "10:00", end: "11:00", title: "Sync" });
    expect(typeof b.id).toBe("string");
    expect(b.id).not.toBe("");
  });

  it("created booking shows up in GET", async () => {
    const b = await created("10:00", "11:00");
    const data = (await (await list(DATE)).json()) as ListBookingsResponse;
    expect(data.bookings).toEqual([b]);
  });

  it("wrong Content-Type → 400 BAD_REQUEST", async () => {
    const res = await collection.POST(
      new Request(URL_BASE, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(slot("10:00", "11:00")),
      }),
    );
    expect(res.status).toBe(400);
    expectNoStore(res);
    expect(await res.json()).toEqual({
      code: "BAD_REQUEST",
      message: API_ERROR_MESSAGES.BAD_REQUEST,
    });
  });

  it("missing Content-Type → 400", async () => {
    const res = await collection.POST(
      new Request(URL_BASE, { method: "POST", body: "{}" , headers: {"content-type": ""}}),
    );
    expect(res.status).toBe(400);
  });

  it("application/json with charset is accepted", async () => {
    const res = await collection.POST(
      new Request(URL_BASE, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(slot("10:00", "11:00")),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("broken JSON → 400 BAD_REQUEST", async () => {
    const res = await collection.POST(
      new Request(URL_BASE, { method: "POST", headers: JSON_HEADERS, body: "{not json" }),
    );
    expect(res.status).toBe(400);
    expectNoStore(res);
    expect(((await res.json()) as ApiErrorBody).code).toBe("BAD_REQUEST");
  });

  it("empty body with JSON type → 400", async () => {
    const res = await collection.POST(
      new Request(URL_BASE, { method: "POST", headers: JSON_HEADERS, body: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("422 with errors[{field?,code}] and message from messages.ts", async () => {
    const res = await post(slot("10:00", "10:15"));
    expect(res.status).toBe(422);
    expectNoStore(res);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe("VALIDATION");
    expect(body.message).toBe(API_ERROR_MESSAGES.VALIDATION);
    expect(body.errors).toContainEqual({ field: "end", code: "TOO_SHORT" });
    expect(body.conflicts).toBeUndefined();
  });

  it("422 for a parse error (non-object body)", async () => {
    const res = await post([1, 2]);
    expect(res.status).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it("422 for past date", async () => {
    const res = await post(slot("10:00", "11:00", "2000-01-03"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).errors).toContainEqual({
      field: "date",
      code: "PAST_DATE",
    });
  });

  it("409 on overlap with conflicts", async () => {
    const a = await created("10:00", "11:00");
    const res = await post(slot("10:30", "11:30"));
    expect(res.status).toBe(409);
    expectNoStore(res);
    expect(await res.json()).toEqual({
      code: "CONFLICT",
      message: API_ERROR_MESSAGES.CONFLICT,
      conflicts: [a],
    });
  });

  it("touching boundary → 201", async () => {
    await created("10:00", "11:00");
    expect((await post(slot("11:00", "12:00"))).status).toBe(201);
  });

  it("invalid still 422 (not 409) when it also overlaps", async () => {
    await created("10:00", "11:00");
    const res = await post(slot("10:00", "12:30"));
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/bookings/[id]", () => {
  it("200 with the updated booking", async () => {
    const b = await created("10:00", "11:00");
    const res = await patch(b.id, slot("13:00", "14:00", DATE, { title: "T" }));
    expect(res.status).toBe(200);
    expectNoStore(res);
    expect(await res.json()).toEqual({ id: b.id, date: DATE, start: "13:00", end: "14:00", title: "T" });
  });

  it("body fully replaces (no title merge)", async () => {
    const res0 = await post(slot("10:00", "11:00", DATE, { title: "Old" }));
    const b = (await res0.json()) as Booking;
    const res = await patch(b.id, slot("10:00", "11:00"));
    expect(((await res.json()) as Booking).title).toBeUndefined();
  });

  it("self-overlap is OK", async () => {
    const b = await created("10:00", "11:00");
    expect((await patch(b.id, slot("10:15", "11:15"))).status).toBe(200);
  });

  it("404 for unknown id", async () => {
    const res = await patch("nope", slot("10:00", "11:00"));
    expect(res.status).toBe(404);
    expectNoStore(res);
    expect(await res.json()).toEqual({
      code: "NOT_FOUND",
      message: API_ERROR_MESSAGES.NOT_FOUND,
    });
  });

  it("409 when overlapping another booking", async () => {
    const a = await created("10:00", "11:00");
    const b = await created("12:00", "13:00");
    const res = await patch(b.id, slot("10:30", "12:30"));
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiErrorBody).conflicts).toEqual([a]);
  });

  it("422 for invalid body", async () => {
    const b = await created("10:00", "11:00");
    const res = await patch(b.id, slot("10:00", "10:00"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).errors).toContainEqual({
      field: "end",
      code: "START_NOT_BEFORE_END",
    });
  });

  it("400 for wrong Content-Type and broken JSON", async () => {
    const b = await created("10:00", "11:00");
    const ctx = { params: Promise.resolve({ id: b.id }) };
    const r1 = await item.PATCH(
      new Request(`${URL_BASE}/${b.id}`, {
        method: "PATCH",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
      ctx,
    );
    const r2 = await item.PATCH(
      new Request(`${URL_BASE}/${b.id}`, { method: "PATCH", headers: JSON_HEADERS, body: "{" }),
      ctx,
    );
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expectNoStore(r1);
  });

  it("moves to another date", async () => {
    const b = await created("10:00", "11:00");
    const res = await patch(b.id, slot("10:00", "11:00", "2099-01-06"));
    expect(res.status).toBe(200);
    expect(((await (await list(DATE)).json()) as ListBookingsResponse).bookings).toEqual([]);
  });
});

describe("DELETE /api/bookings/[id]", () => {
  it("204 with empty body, then 404", async () => {
    const b = await created("10:00", "11:00");
    const res = await del(b.id);
    expect(res.status).toBe(204);
    expectNoStore(res);
    expect(await res.text()).toBe("");
    const again = await del(b.id);
    expect(again.status).toBe(404);
    expectNoStore(again);
    expect(((await again.json()) as ApiErrorBody).code).toBe("NOT_FOUND");
  });

  it("deleted booking disappears from GET", async () => {
    const b = await created("10:00", "11:00");
    await del(b.id);
    expect(((await (await list(DATE)).json()) as ListBookingsResponse).bookings).toEqual([]);
  });

  it("404 for unknown id", async () => {
    expect((await del("nope")).status).toBe(404);
  });
});

describe("forced conflict header", () => {
  const forced = { [FORCE_CONFLICT_HEADER]: "1" };

  it("with MOCK_ALLOW_FORCED_CONFLICT=1 → 409 on POST", async () => {
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "1");
    const res = await post(slot("10:00", "11:00"), forced);
    expect(res.status).toBe(409);
    expectNoStore(res);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe(API_ERROR_MESSAGES.CONFLICT);
    expect(((await (await list(DATE)).json()) as ListBookingsResponse).bookings).toEqual([]);
  });

  it("with MOCK_ALLOW_FORCED_CONFLICT=1 → 409 on PATCH", async () => {
    const b = await created("10:00", "11:00");
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "1");
    const res = await patch(b.id, slot("13:00", "14:00"), forced);
    expect(res.status).toBe(409);
  });

  it("without the env flag the header is ignored → 201", async () => {
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "");
    const res = await post(slot("10:00", "11:00"), forced);
    expect(res.status).toBe(201);
  });

  it("env flag set but no header → 201", async () => {
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "1");
    expect((await post(slot("10:00", "11:00"))).status).toBe(201);
  });

  it("env flag not exactly '1' → ignored", async () => {
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "true");
    expect((await post(slot("10:00", "11:00"), forced)).status).toBe(201);
  });
});

describe("error body shape", () => {
  it("has code and message, and only the documented keys", async () => {
    const res = await post(slot("10:00", "10:15"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["code", "errors", "message"]);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
