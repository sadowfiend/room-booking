import { describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking, BookingInput } from "@/domain/booking/types";
import { FORCE_CONFLICT_HEADER } from "./contract";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  NetworkError,
  NotFoundError,
  ValidationError,
  isAbortError,
} from "./errors";
import { bookingsApi, createBookingsApi } from "./bookings";

const BASE = "http://test.local";
const booking = {
  id: "b1",
  date: "2026-10-08",
  start: "10:00",
  end: "11:00",
  title: "Sync",
} as unknown as Booking;
const input = {
  date: "2026-10-08",
  start: "10:00",
  end: "11:00",
  title: "Sync",
} as unknown as BookingInput;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function setup(res: Response | (() => Promise<Response>)) {
  const fetchImpl = vi.fn(typeof res === "function" ? res : async () => res);
  const api = createBookingsApi({
    baseUrl: BASE,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { api, fetchImpl };
}

function lastCall(f: ReturnType<typeof vi.fn>) {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

describe("requests", () => {
  it("list: GET with encoded date, no-store, signal", async () => {
    const { api, fetchImpl } = setup(json({ bookings: [] }));
    const ctl = new AbortController();
    await api.list("2026-10-08", { signal: ctl.signal });
    const { url, init } = lastCall(fetchImpl);
    expect(url).toBe(`${BASE}/api/bookings?date=2026-10-08`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
    expect(init.body).toBeUndefined();
  });

  it("list: date is URL-encoded", async () => {
    const { api, fetchImpl } = setup(json({ bookings: [] }));
    await api.list("a&b=c d" as never);
    expect(lastCall(fetchImpl).url).toBe(`${BASE}/api/bookings?date=a%26b%3Dc%20d`);
  });

  it("create: POST with JSON body and content type", async () => {
    const { api, fetchImpl } = setup(json(booking, 201));
    const ctl = new AbortController();
    await api.create(input, { signal: ctl.signal });
    const { url, init, headers } = lastCall(fetchImpl);
    expect(url).toBe(`${BASE}/api/bookings`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
  });

  it("update: PATCH to encoded id with full body", async () => {
    const { api, fetchImpl } = setup(json(booking));
    const ctl = new AbortController();
    await api.update("a/b c", input, { signal: ctl.signal });
    const { url, init, headers } = lastCall(fetchImpl);
    expect(url).toBe(`${BASE}/api/bookings/a%2Fb%20c`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
  });

  it("remove: DELETE to id, no-store, signal", async () => {
    const { api, fetchImpl } = setup(new Response(null, { status: 204 }));
    const ctl = new AbortController();
    await api.remove("b1", { signal: ctl.signal });
    const { url, init } = lastCall(fetchImpl);
    expect(url).toBe(`${BASE}/api/bookings/b1`);
    expect(init.method).toBe("DELETE");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(ctl.signal);
  });

  it("forceConflict sends the header; absent otherwise", async () => {
    const a = setup(json(booking, 201));
    await a.api.create(input, { forceConflict: true });
    expect(lastCall(a.fetchImpl).headers[FORCE_CONFLICT_HEADER]).toBe("1");
    expect(FORCE_CONFLICT_HEADER).toBe("x-mock-force-conflict");

    const b = setup(json(booking, 201));
    await b.api.create(input);
    expect(lastCall(b.fetchImpl).headers[FORCE_CONFLICT_HEADER]).toBeUndefined();

    const c = setup(json(booking, 201));
    await c.api.create(input, { forceConflict: false });
    expect(lastCall(c.fetchImpl).headers[FORCE_CONFLICT_HEADER]).toBeUndefined();
  });

  it("works with a stubbed global fetch and default config", async () => {
    const f = vi.fn(async () => json({ bookings: [booking] }));
    vi.stubGlobal("fetch", f);
    try {
      await expect(bookingsApi.list("2026-10-08")).resolves.toEqual([booking]);
      expect(f).toHaveBeenCalledTimes(1);
      expect((f.mock.calls[0] as unknown[])[0]).toBe("/api/bookings?date=2026-10-08");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("success responses", () => {
  it("list unwraps bookings", async () => {
    const { api } = setup(json({ bookings: [booking] }));
    await expect(api.list("2026-10-08")).resolves.toEqual([booking]);
  });
  it("create returns the booking on 201", async () => {
    const { api } = setup(json(booking, 201));
    await expect(api.create(input)).resolves.toEqual(booking);
  });
  it("update returns the booking on 200", async () => {
    const { api } = setup(json(booking, 200));
    await expect(api.update("b1", input)).resolves.toEqual(booking);
  });
  it("remove resolves undefined on 204", async () => {
    const { api } = setup(new Response(null, { status: 204 }));
    await expect(api.remove("b1")).resolves.toBeUndefined();
  });
});

describe("error mapping", () => {
  const issues = [{ field: "start", code: "IN_PAST" }];

  it("400 -> BadRequestError", async () => {
    const { api } = setup(json({ code: "BAD_REQUEST", message: "bad json" }, 400));
    const e = await api.create(input).catch((x) => x);
    expect(e).toBeInstanceOf(BadRequestError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("BAD_REQUEST");
    expect(e.message).toBe("bad json");
  });

  it("422 -> ValidationError with issues", async () => {
    const { api } = setup(
      json({ code: "VALIDATION", message: "m", errors: issues }, 422),
    );
    const e = await api.create(input).catch((x) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("VALIDATION");
    expect(e.issues).toEqual(issues);
    expect(e.message).toBe("m");
  });

  it("409 -> ConflictError with conflicts", async () => {
    const { api } = setup(
      json({ code: "CONFLICT", message: "busy", conflicts: [booking] }, 409),
    );
    const e = await api.update("b1", input).catch((x) => x);
    expect(e).toBeInstanceOf(ConflictError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("CONFLICT");
    expect(e.conflicts).toEqual([booking]);
    expect(e.message).toBe("busy");
  });

  it("404 -> NotFoundError", async () => {
    const { api } = setup(json({ code: "NOT_FOUND", message: "nope" }, 404));
    const e = await api.remove("x").catch((x) => x);
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("nope");
  });

  it.each([
    [400, BadRequestError, "BAD_REQUEST"],
    [422, ValidationError, "VALIDATION"],
    [409, ConflictError, "CONFLICT"],
    [404, NotFoundError, "NOT_FOUND"],
  ] as const)("%i with missing body -> default message, empty extras", async (status, Cls, code) => {
    const { api } = setup(() => Promise.resolve(new Response(null, { status })));
    const e = await api.create(input).catch((x) => x);
    expect(e).toBeInstanceOf(Cls);
    expect(e.code).toBe(code);
    expect(e.message).toBe(API_ERROR_MESSAGES[code]);
    if (status === 422) expect(e.issues).toEqual([]);
    if (status === 409) expect(e.conflicts).toEqual([]);
  });

  it.each([400, 422, 409, 404])("%i with invalid JSON body -> right class, default message", async (status) => {
    const { api } = setup(() => Promise.resolve(new Response("<html>", { status })));
    const e = await api.create(input).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).not.toBe("UNKNOWN");
    expect(e.message).toBe(API_ERROR_MESSAGES[e.code as keyof typeof API_ERROR_MESSAGES]);
  });

  it("non-array errors/conflicts become empty arrays", async () => {
    const v = setup(json({ errors: "x" }, 422));
    expect((await v.api.create(input).catch((x) => x)).issues).toEqual([]);
    const c = setup(json({ conflicts: {} }, 409));
    expect((await c.api.create(input).catch((x) => x)).conflicts).toEqual([]);
  });

  it.each([500, 503, 418])("%i -> ApiError UNKNOWN", async (status) => {
    const { api } = setup(json({ code: "X", message: "boom" }, status));
    const e = await api.list("2026-10-08").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(ValidationError);
    expect(e).not.toBeInstanceOf(NetworkError);
    expect(e.code).toBe("UNKNOWN");
  });

  it("success with unreadable JSON -> UNKNOWN", async () => {
    for (const call of [
      (a: ReturnType<typeof setup>["api"]) => a.list("2026-10-08"),
      (a: ReturnType<typeof setup>["api"]) => a.create(input),
      (a: ReturnType<typeof setup>["api"]) => a.update("b1", input),
    ]) {
      const { api } = setup(() => Promise.resolve(new Response("not json", { status: 200 })));
      const e = await call(api).catch((x) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(e.code).toBe("UNKNOWN");
    }
  });

  it("list without bookings array -> UNKNOWN", async () => {
    for (const body of [{}, { bookings: "x" }, { bookings: null }, null]) {
      const { api } = setup(json(body));
      const e = await api.list("2026-10-08").catch((x) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(e.code).toBe("UNKNOWN");
    }
  });
});

describe("network and abort", () => {
  it("fetch TypeError -> NetworkError", async () => {
    const { api } = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    const e = await api.list("2026-10-08").catch((x) => x);
    expect(e).toBeInstanceOf(NetworkError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("NETWORK");
    expect(e.message).toBe(API_ERROR_MESSAGES.NETWORK);
  });

  it("abort while fetching -> AbortError, not NetworkError", async () => {
    const ctl = new AbortController();
    const { api } = setup(
      () =>
        new Promise<Response>((_, reject) => {
          ctl.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const p = api.list("2026-10-08", { signal: ctl.signal }).catch((x) => x);
    ctl.abort();
    const e = await p;
    expect(e).not.toBeInstanceOf(NetworkError);
    expect(isAbortError(e)).toBe(true);
    expect(e.name).toBe("AbortError");
  });

  it("abort before fetching -> AbortError", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { api } = setup(() => Promise.reject(new DOMException("Aborted", "AbortError")));
    const e = await api.create(input, { signal: ctl.signal }).catch((x) => x);
    expect(e).not.toBeInstanceOf(NetworkError);
    expect(isAbortError(e)).toBe(true);
  });
});

describe("isAbortError", () => {
  it("recognizes AbortError only", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new TypeError("x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
