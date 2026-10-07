import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepository, MemoryBookingRepository } from "./memory-repository";

const D = "2030-06-10";
const input = (start: string, end: string, date = D, title?: string) => ({
  date,
  start,
  end,
  ...(title === undefined ? {} : { title }),
});

describe("MemoryBookingRepository", () => {
  let repo: MemoryBookingRepository;
  beforeEach(() => {
    repo = new MemoryBookingRepository();
  });

  it("has kind memory", () => {
    expect(repo.kind).toBe("memory");
  });

  it("all methods return Promises", () => {
    expect(repo.listByDate(D)).toBeInstanceOf(Promise);
    expect(repo.getById("x")).toBeInstanceOf(Promise);
    expect(repo.create(input("10:00", "11:00"))).toBeInstanceOf(Promise);
    expect(repo.update("x", input("10:00", "11:00"))).toBeInstanceOf(Promise);
    expect(repo.remove("x")).toBeInstanceOf(Promise);
  });

  describe("create / list", () => {
    it("creates with generated id and returns the booking", async () => {
      const r = await repo.create(input("10:00", "11:00", D, "Sync"));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.booking.id).toBeTruthy();
      expect(r.booking).toMatchObject({ date: D, start: "10:00", end: "11:00", title: "Sync" });
    });

    it("generates distinct ids", async () => {
      const a = await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("11:00", "12:00"));
      if (!a.ok || !b.ok) throw new Error("unexpected");
      expect(a.booking.id).not.toBe(b.booking.id);
    });

    it("lists sorted by start regardless of insertion order", async () => {
      await repo.create(input("14:00", "15:00"));
      await repo.create(input("09:00", "09:30"));
      await repo.create(input("11:15", "12:00"));
      const list = await repo.listByDate(D);
      expect(list.map((b) => b.start)).toEqual(["09:00", "11:15", "14:00"]);
    });

    it("lists only the requested date", async () => {
      await repo.create(input("10:00", "11:00", D));
      await repo.create(input("10:00", "11:00", "2030-06-11"));
      expect(await repo.listByDate(D)).toHaveLength(1);
      expect(await repo.listByDate("2030-06-12")).toEqual([]);
    });

    it("same time on different dates is not a conflict", async () => {
      await repo.create(input("10:00", "11:00", D));
      const r = await repo.create(input("10:00", "11:00", "2030-06-11"));
      expect(r.ok).toBe(true);
    });
  });

  describe("conflicts", () => {
    it("returns reason conflict with overlapping bookings", async () => {
      const a = await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      if (!a.ok || !b.ok) throw new Error("unexpected");
      const r = await repo.create(input("10:30", "12:30"));
      expect(r).toEqual({
        ok: false,
        reason: "conflict",
        conflicts: expect.arrayContaining([a.booking, b.booking]),
      });
      if (r.ok || r.reason !== "conflict") throw new Error("unexpected");
      expect(r.conflicts).toHaveLength(2);
      expect(await repo.listByDate(D)).toHaveLength(2);
    });

    it("identical interval conflicts", async () => {
      await repo.create(input("10:00", "11:00"));
      const r = await repo.create(input("10:00", "11:00"));
      expect(r.ok).toBe(false);
    });

    it("contained interval conflicts", async () => {
      await repo.create(input("09:00", "12:00"));
      const r = await repo.create(input("10:00", "10:30"));
      expect(r).toMatchObject({ ok: false, reason: "conflict" });
    });

    it("touching boundaries are not conflicts (both sides)", async () => {
      const mid = await repo.create(input("10:00", "11:00"));
      expect(mid.ok).toBe(true);
      expect((await repo.create(input("11:00", "12:00"))).ok).toBe(true);
      expect((await repo.create(input("09:00", "10:00"))).ok).toBe(true);
    });

    it("one minute of overlap is a conflict", async () => {
      await repo.create(input("10:00", "11:00"));
      const r = await repo.create(input("10:59", "11:30"));
      expect(r.ok).toBe(false);
    });
  });

  describe("getById", () => {
    it("returns the booking or null", async () => {
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      expect(await repo.getById(r.booking.id)).toEqual(r.booking);
      expect(await repo.getById("nope")).toBeNull();
    });
  });

  describe("copies", () => {
    it("mutating returned objects does not affect storage", async () => {
      const r = await repo.create(input("10:00", "11:00", D, "A"));
      if (!r.ok) throw new Error("unexpected");
      r.booking.start = "09:00";
      const got = await repo.getById(r.booking.id);
      got!.title = "changed";
      const list = await repo.listByDate(D);
      list[0].end = "18:00";
      const fresh = await repo.getById(r.booking.id);
      expect(fresh).toMatchObject({ start: "10:00", end: "11:00", title: "A" });
    });

    it("mutating returned conflicts does not affect storage", async () => {
      const a = await repo.create(input("10:00", "11:00"));
      if (!a.ok) throw new Error("unexpected");
      const r = await repo.create(input("10:00", "11:00"));
      if (r.ok || r.reason !== "conflict") throw new Error("unexpected");
      r.conflicts[0].start = "09:00";
      expect((await repo.getById(a.booking.id))!.start).toBe("10:00");
    });
  });

  describe("update", () => {
    it("replaces the booking keeping id", async () => {
      const r = await repo.create(input("10:00", "11:00", D, "Old"));
      if (!r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("13:00", "14:00", D, "New"));
      expect(u).toEqual({
        ok: true,
        booking: { id: r.booking.id, date: D, start: "13:00", end: "14:00", title: "New" },
      });
      expect(await repo.getById(r.booking.id)).toEqual((u as { booking: unknown }).booking);
    });

    it("does not conflict with itself (rule 7)", async () => {
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("10:30", "11:30"));
      expect(u.ok).toBe(true);
      expect(await repo.listByDate(D)).toHaveLength(1);
    });

    it("conflicts with another booking and leaves state unchanged", async () => {
      const a = await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      if (!a.ok || !b.ok) throw new Error("unexpected");
      const u = await repo.update(b.booking.id, input("10:30", "12:30"));
      expect(u).toMatchObject({ ok: false, reason: "conflict", conflicts: [a.booking] });
      expect(await repo.getById(b.booking.id)).toEqual(b.booking);
    });

    it("touching another booking is allowed", async () => {
      await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      if (!b.ok) throw new Error("unexpected");
      expect((await repo.update(b.booking.id, input("11:00", "12:00"))).ok).toBe(true);
    });

    it("can move to another date", async () => {
      const r = await repo.create(input("10:00", "11:00", D));
      if (!r.ok) throw new Error("unexpected");
      const other = "2030-06-11";
      const u = await repo.update(r.booking.id, input("10:00", "11:00", other));
      expect(u.ok).toBe(true);
      expect(await repo.listByDate(D)).toEqual([]);
      expect(await repo.listByDate(other)).toHaveLength(1);
    });

    it("moving to another date checks conflicts on the target date", async () => {
      const other = "2030-06-11";
      await repo.create(input("10:00", "11:00", other));
      const r = await repo.create(input("10:00", "11:00", D));
      if (!r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("10:30", "11:30", other));
      expect(u).toMatchObject({ ok: false, reason: "conflict" });
      expect(await repo.listByDate(D)).toHaveLength(1);
    });

    it("unknown id → not_found", async () => {
      expect(await repo.update("nope", input("10:00", "11:00"))).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await repo.listByDate(D)).toEqual([]);
    });
  });

  describe("remove", () => {
    it("true when removed, false afterwards and for unknown ids", async () => {
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      expect(await repo.remove(r.booking.id)).toBe(true);
      expect(await repo.remove(r.booking.id)).toBe(false);
      expect(await repo.remove("nope")).toBe(false);
      expect(await repo.listByDate(D)).toEqual([]);
    });

    it("frees the slot", async () => {
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      await repo.remove(r.booking.id);
      expect((await repo.create(input("10:00", "11:00"))).ok).toBe(true);
    });
  });

  describe("getMemoryRepository", () => {
    it("returns the same instance every time", () => {
      expect(getMemoryRepository()).toBe(getMemoryRepository());
      expect(getMemoryRepository().kind).toBe("memory");
    });
  });
});
