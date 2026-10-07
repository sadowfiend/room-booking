import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBookingService } from "./booking-service";
import type { BookingService } from "./booking-service";
import { MemoryBookingRepository } from "./memory-repository";
import type { BookingRepository } from "./repository";

// 2030-06-10 10:00 in Asia/Bishkek (UTC+6) = 04:00 UTC.
const NOW = new Date("2030-06-10T04:00:00Z");
const TODAY = "2030-06-10";
const FUTURE = "2030-06-12";
const PAST = "2030-06-09";

const body = (start: string, end: string, date = FUTURE, extra: object = {}) => ({
  date,
  start,
  end,
  ...extra,
});

function setup(allowForced = false) {
  const repo = new MemoryBookingRepository();
  const service = createBookingService(repo, {
    now: () => NOW,
    allowForcedConflict: () => allowForced,
  });
  return { repo, service };
}

function codes(r: Awaited<ReturnType<BookingService["create"]>>) {
  if (r.ok || r.error.code !== "VALIDATION") throw new Error("expected VALIDATION");
  return r.error.errors.map((e) => e.code);
}

describe("booking service: create", () => {
  let repo: MemoryBookingRepository;
  let service: BookingService;
  beforeEach(() => {
    ({ repo, service } = setup());
  });

  it("creates a valid booking", async () => {
    const r = await service.create(body("10:00", "11:00", FUTURE, { title: "Sync" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ date: FUTURE, start: "10:00", end: "11:00", title: "Sync" });
    expect(await repo.listByDate(FUTURE)).toHaveLength(1);
  });

  it("accepts the workday edges 09:00-18:00 with max duration 120", async () => {
    expect((await service.create(body("09:00", "11:00"))).ok).toBe(true);
    expect((await service.create(body("16:00", "18:00"))).ok).toBe(true);
  });

  it.each([
    ["null", null],
    ["string", "x"],
    ["array", []],
    ["empty object", {}],
  ])("malformed body (%s) → VALIDATION with parse codes", async (_n, raw) => {
    const r = await service.create(raw);
    expect(r.ok).toBe(false);
    if (r.ok || r.error.code !== "VALIDATION") throw new Error("expected VALIDATION");
    expect(r.error.errors.length).toBeGreaterThan(0);
  });

  it("bad time format → INVALID_TIME on the field", async () => {
    const r = await service.create(body("9am", "11:00"));
    if (r.ok || r.error.code !== "VALIDATION") throw new Error("expected VALIDATION");
    expect(r.error.errors).toContainEqual({ field: "start", code: "INVALID_TIME" });
  });

  it("bad date → INVALID_DATE", async () => {
    const r = await service.create(body("10:00", "11:00", "2030-02-30"));
    if (r.ok || r.error.code !== "VALIDATION") throw new Error("expected VALIDATION");
    expect(r.error.errors).toContainEqual({ field: "date", code: "INVALID_DATE" });
  });

  it.each([
    ["start before workday", body("08:45", "09:30"), "OUTSIDE_WORKING_HOURS"],
    ["end after workday", body("17:30", "18:15"), "OUTSIDE_WORKING_HOURS"],
    ["start == end", body("10:00", "10:00"), "START_NOT_BEFORE_END"],
    ["start > end", body("11:00", "10:00"), "START_NOT_BEFORE_END"],
    ["duration 15 < 30", body("10:00", "10:15"), "TOO_SHORT"],
    ["duration 135 > 120", body("10:00", "12:15"), "TOO_LONG"],
    ["duration 150 > 120", body("10:00", "12:30"), "TOO_LONG"],
    ["past date", body("10:00", "11:00", PAST), "PAST_DATE"],
    ["off step", body("10:10", "11:00"), "OFF_STEP"],
  ])("rule violation: %s → VALIDATION", async (_n, raw, code) => {
    const r = await service.create(raw);
    expect(codes(r)).toContain(code);
  });

  it("duration exactly 30 and exactly 120 are valid", async () => {
    expect((await service.create(body("10:00", "10:30"))).ok).toBe(true);
    expect((await service.create(body("12:00", "14:00"))).ok).toBe(true);
  });

  it("today: start in the past → VALIDATION START_IN_PAST", async () => {
    const r = await service.create(body("09:45", "10:45", TODAY));
    expect(codes(r)).toContain("START_IN_PAST");
  });

  it("today: start == now is allowed", async () => {
    expect((await service.create(body("10:00", "11:00", TODAY))).ok).toBe(true);
  });

  it("today: later slot allowed", async () => {
    expect((await service.create(body("10:15", "11:00", TODAY))).ok).toBe(true);
  });

  it("uses room timezone, not UTC: 22:00 UTC on 06-09 is already 06-10 04:00 local", async () => {
    const repo2 = new MemoryBookingRepository();
    const s = createBookingService(repo2, {
      now: () => new Date("2030-06-09T22:00:00Z"),
      allowForcedConflict: () => false,
    });
    const r = await s.create(body("09:00", "10:00", "2030-06-09"));
    expect(codes(r)).toContain("PAST_DATE");
  });

  it("overlap → CONFLICT with conflicts", async () => {
    const a = await service.create(body("10:00", "11:00"));
    if (!a.ok) throw new Error("unexpected");
    const r = await service.create(body("10:30", "11:30"));
    expect(r).toEqual({
      ok: false,
      error: { code: "CONFLICT", conflicts: [a.value] },
    });
  });

  it("touching booking is not a conflict", async () => {
    await service.create(body("10:00", "11:00"));
    expect((await service.create(body("11:00", "12:00"))).ok).toBe(true);
  });
});

describe("booking service: ordering through the repository port", () => {
  function spyRepo() {
    const real = new MemoryBookingRepository();
    const repo: BookingRepository = {
      kind: "memory",
      listByDate: vi.fn((d) => real.listByDate(d)),
      getById: vi.fn((id) => real.getById(id)),
      create: vi.fn((i) => real.create(i)),
      update: vi.fn((id, i) => real.update(id, i)),
      remove: vi.fn((id) => real.remove(id)),
    };
    return { real, repo };
  }

  it("validation failure never reaches repo.create", async () => {
    const { repo } = spyRepo();
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    await s.create(body("10:00", "10:00"));
    await s.create({ nonsense: true });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("parse failure on update never touches the repo (before getById)", async () => {
    const { repo } = spyRepo();
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    const r = await s.update("unknown", { garbage: 1 });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(repo.getById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("update of unknown id with invalid-by-rules body → NOT_FOUND (getById before validate)", async () => {
    const { repo } = spyRepo();
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    const r = await s.update("unknown", body("10:00", "10:00"));
    expect(r).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("update validation failure never reaches repo.update", async () => {
    const { real, repo } = spyRepo();
    const created = await real.create(body("10:00", "11:00"));
    if (!created.ok) throw new Error("unexpected");
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    const r = await s.update(created.booking.id, body("10:00", "10:00"));
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("valid create is delegated to repo.create with the parsed input", async () => {
    const { repo } = spyRepo();
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    await s.create(body("10:00", "11:00"));
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: FUTURE, start: "10:00", end: "11:00" }),
    );
  });

  it("repo not_found from update maps to NOT_FOUND", async () => {
    const { repo } = spyRepo();
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "x", date: FUTURE, start: "10:00", end: "11:00",
    });
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    const r = await s.update("x", body("10:00", "11:00"));
    expect(r).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("repo conflict (race after validation) maps to CONFLICT with its conflicts", async () => {
    const { repo } = spyRepo();
    const other = { id: "o", date: FUTURE, start: "10:00", end: "11:00" };
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, reason: "conflict", conflicts: [other],
    });
    const s = createBookingService(repo, { now: () => NOW, allowForcedConflict: () => false });
    const r = await s.create(body("10:00", "11:00"));
    expect(r).toEqual({ ok: false, error: { code: "CONFLICT", conflicts: [other] } });
  });
});

describe("booking service: update", () => {
  let repo: MemoryBookingRepository;
  let service: BookingService;
  beforeEach(() => {
    ({ repo, service } = setup());
  });

  async function make(start = "10:00", end = "11:00", date = FUTURE, title?: string) {
    const r = await repo.create({ date, start, end, ...(title ? { title } : {}) });
    if (!r.ok) throw new Error("unexpected");
    return r.booking;
  }

  it("updates a booking", async () => {
    const b = await make();
    const r = await service.update(b.id, body("13:00", "14:00"));
    expect(r).toEqual({
      ok: true,
      value: { id: b.id, date: FUTURE, start: "13:00", end: "14:00" },
    });
  });

  it("full body replaces: title is not merged from the old booking", async () => {
    const b = await make("10:00", "11:00", FUTURE, "Old title");
    const r = await service.update(b.id, body("10:00", "11:00"));
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.title).toBeUndefined();
    expect((await repo.getById(b.id))!.title).toBeUndefined();
  });

  it("replaces the title when given", async () => {
    const b = await make("10:00", "11:00", FUTURE, "Old");
    const r = await service.update(b.id, body("10:00", "11:00", FUTURE, { title: "New" }));
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.title).toBe("New");
  });

  it("unknown id with valid body → NOT_FOUND", async () => {
    expect(await service.update("nope", body("10:00", "11:00"))).toEqual({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("invalid body → VALIDATION even for unknown id", async () => {
    const r = await service.update("nope", { date: "bad" });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("rule violation → VALIDATION", async () => {
    const b = await make();
    expect(codes(await service.update(b.id, body("10:00", "10:15")))).toContain("TOO_SHORT");
  });

  it("overlap with another booking → CONFLICT", async () => {
    await make("10:00", "11:00");
    const b = await make("12:00", "13:00");
    const r = await service.update(b.id, body("10:30", "12:30"));
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("overlap with itself is allowed", async () => {
    const b = await make("10:00", "11:00");
    expect((await service.update(b.id, body("10:15", "11:15"))).ok).toBe(true);
  });

  it("moving to another date works", async () => {
    const b = await make();
    const r = await service.update(b.id, body("10:00", "11:00", "2030-06-13"));
    expect(r.ok).toBe(true);
    expect(await repo.listByDate(FUTURE)).toEqual([]);
  });

  it("finished booking cannot be edited → VALIDATION BOOKING_FINISHED", async () => {
    const b = await make("09:00", "10:00", TODAY); // ends exactly at now
    const r = await service.update(b.id, body("14:00", "15:00", TODAY));
    expect(codes(r)).toEqual(["BOOKING_FINISHED"]);
  });

  it("booking on a past date cannot be edited", async () => {
    const b = await make("09:00", "10:00", PAST);
    const r = await service.update(b.id, body("14:00", "15:00", FUTURE));
    expect(codes(r)).toEqual(["BOOKING_FINISHED"]);
  });

  it("ongoing booking: keeping original start is allowed", async () => {
    const b = await make("09:30", "10:30", TODAY); // now is 10:00 → ongoing
    const r = await service.update(b.id, body("09:30", "11:00", TODAY));
    expect(r.ok).toBe(true);
  });

  it("ongoing booking: moving start into the past is rejected", async () => {
    const b = await make("09:30", "10:30", TODAY);
    const r = await service.update(b.id, body("09:15", "11:00", TODAY));
    expect(codes(r)).toContain("START_IN_PAST");
  });

  it("ongoing booking: end not after now is rejected", async () => {
    const b = await make("09:30", "10:30", TODAY);
    const r = await service.update(b.id, body("09:30", "10:00", TODAY));
    expect(codes(r)).toContain("END_IN_PAST");
  });
});

describe("booking service: forced conflict", () => {
  it("honoured only when ctx.forceConflict and allowForcedConflict() are both true", async () => {
    const { repo, service } = setup(true);
    const r = await service.create(body("10:00", "11:00"), { forceConflict: true });
    expect(r).toEqual({ ok: false, error: { code: "CONFLICT", conflicts: [] } });
    expect(await repo.listByDate(FUTURE)).toEqual([]);
  });

  it("forced conflict reports real overlapping bookings", async () => {
    const { service } = setup(true);
    const a = await service.create(body("10:00", "11:00"));
    if (!a.ok) throw new Error("unexpected");
    const r = await service.create(body("10:30", "11:30"), { forceConflict: true });
    expect(r).toEqual({ ok: false, error: { code: "CONFLICT", conflicts: [a.value] } });
  });

  it("ignored when allowForcedConflict() is false", async () => {
    const { service } = setup(false);
    const r = await service.create(body("10:00", "11:00"), { forceConflict: true });
    expect(r.ok).toBe(true);
  });

  it("ignored when ctx.forceConflict is false/absent even if allowed", async () => {
    const { service } = setup(true);
    expect((await service.create(body("10:00", "11:00"), { forceConflict: false })).ok).toBe(true);
    expect((await service.create(body("12:00", "13:00"))).ok).toBe(true);
  });

  it("applies to update too and leaves the booking unchanged", async () => {
    const { repo, service } = setup(true);
    const c = await service.create(body("10:00", "11:00"));
    if (!c.ok) throw new Error("unexpected");
    const r = await service.update(c.value.id, body("13:00", "14:00"), { forceConflict: true });
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await repo.getById(c.value.id))!.start).toBe("10:00");
  });

  it("validation still wins over forced conflict", async () => {
    const { service } = setup(true);
    const r = await service.create(body("10:00", "10:00"), { forceConflict: true });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("update: unknown id is NOT_FOUND even with forced conflict", async () => {
    const { service } = setup(true);
    const r = await service.update("nope", body("10:00", "11:00"), { forceConflict: true });
    expect(r).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("default allowForcedConflict reads MOCK_ALLOW_FORCED_CONFLICT === '1'", async () => {
    const mk = () =>
      createBookingService(new MemoryBookingRepository(), { now: () => NOW });
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "1");
    expect((await mk().create(body("10:00", "11:00"), { forceConflict: true })).ok).toBe(false);
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "0");
    expect((await mk().create(body("10:00", "11:00"), { forceConflict: true })).ok).toBe(true);
    vi.stubEnv("MOCK_ALLOW_FORCED_CONFLICT", "");
    expect((await mk().create(body("10:00", "11:00"), { forceConflict: true })).ok).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("booking service: list", () => {
  it("returns sorted bookings of the date", async () => {
    const { repo, service } = setup();
    await repo.create(body("14:00", "15:00"));
    await repo.create(body("09:00", "10:00"));
    await repo.create(body("09:00", "10:00", "2030-07-01"));
    const r = await service.list(FUTURE);
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.map((b) => b.start)).toEqual(["09:00", "14:00"]);
  });

  it("empty date → empty list", async () => {
    const { service } = setup();
    expect(await service.list(FUTURE)).toEqual({ ok: true, value: [] });
  });

  it("past dates can be listed", async () => {
    const { service } = setup();
    expect((await service.list(PAST)).ok).toBe(true);
  });

  it.each([[null], [""], ["2030-13-01"], ["2030-02-30"], ["10-06-2030"], ["abc"]])(
    "invalid/missing date %j → VALIDATION INVALID_DATE",
    async (d) => {
      const { service } = setup();
      const r = await service.list(d);
      expect(r).toEqual({
        ok: false,
        error: { code: "VALIDATION", errors: [{ field: "date", code: "INVALID_DATE" }] },
      });
    },
  );
});

describe("booking service: remove", () => {
  it("removes, then NOT_FOUND", async () => {
    const { repo, service } = setup();
    const c = await repo.create(body("10:00", "11:00"));
    if (!c.ok) throw new Error("unexpected");
    expect(await service.remove(c.booking.id)).toEqual({ ok: true, value: null });
    expect(await service.remove(c.booking.id)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("unknown id → NOT_FOUND", async () => {
    const { service } = setup();
    expect(await service.remove("nope")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("ongoing booking can be deleted", async () => {
    const { repo, service } = setup();
    const c = await repo.create({ date: TODAY, start: "09:30", end: "10:30" });
    if (!c.ok) throw new Error("unexpected");
    expect((await service.remove(c.booking.id)).ok).toBe(true);
  });
});
