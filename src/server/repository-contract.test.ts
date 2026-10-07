import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { afterAll, describe, expect, it } from "vitest";
import type { Booking } from "@/domain/booking/types";
import { MemoryBookingRepository } from "./memory-repository";
import { MAX_CAS_ATTEMPTS, RedisBookingRepository } from "./redis-repository";
import type { RedisClientLike } from "./redis-repository";
import { resolveRedisEnv } from "./repository-factory";
import type { BookingRepository } from "./repository";

const D = "2030-06-10";
const OTHER = "2030-06-11";
const input = (start: string, end: string, date = D, title?: string) => ({
  date,
  start,
  end,
  ...(title === undefined ? {} : { title }),
});

/** Faithful TS interpretation of CAS_WRITE_SCRIPT (see redis-scripts.ts). */
export class FakeRedis implements RedisClientLike {
  readonly strings = new Map<string, string>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly calls: string[] = [];

  constructor(private readonly yieldEach = false) {}

  private async tick() {
    if (this.yieldEach) await new Promise((r) => setTimeout(r, 0));
  }

  async get(key: string) {
    this.calls.push(`get ${key}`);
    await this.tick();
    return this.strings.get(key) ?? null;
  }

  async hgetall(key: string) {
    this.calls.push(`hgetall ${key}`);
    await this.tick();
    const h = this.hashes.get(key);
    return h && h.size > 0 ? Object.fromEntries(h) : null;
  }

  async eval(_script: string, keys: string[], args: string[]) {
    this.calls.push("eval");
    await this.tick();
    return this.runScript(keys, args);
  }

  /** Synchronous, therefore atomic (like a Redis script). */
  runScript(keys: string[], args: string[]): number {
    const ver = (k: string) => Number(this.strings.get(k) ?? "0");
    if (ver(keys[0]) !== Number(args[0])) return 0;
    if (keys[3] !== undefined && ver(keys[3]) !== Number(args[1])) return 0;
    const hash = (k: string) => {
      let h = this.hashes.get(k);
      if (!h) this.hashes.set(k, (h = new Map()));
      return h;
    };
    if (args[3] === "") {
      hash(keys[1]).delete(args[2]);
      this.strings.delete(keys[2]);
    } else {
      hash(keys[1]).set(args[2], args[3]);
      this.strings.set(keys[2], args[3]);
    }
    this.strings.set(keys[0], String(ver(keys[0]) + 1));
    if (keys[3] !== undefined) {
      hash(keys[4]).delete(args[2]);
      this.strings.set(keys[3], String(ver(keys[3]) + 1));
    }
    return 1;
  }
}

type Factory = () => BookingRepository;

function contract(make: Factory) {
  it("has a kind", () => {
    expect(["memory", "redis"]).toContain(make().kind);
  });

  describe("create / list", () => {
    it("creates with generated id and returns the booking", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00", D, "Sync"));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.booking.id).toBeTruthy();
      expect(r.booking).toMatchObject({ date: D, start: "10:00", end: "11:00", title: "Sync" });
    });

    it("lists sorted by start regardless of insertion order", async () => {
      const repo = make();
      await repo.create(input("14:00", "15:00"));
      await repo.create(input("09:00", "09:30"));
      await repo.create(input("11:15", "12:00"));
      const list = await repo.listByDate(D);
      expect(list.map((b) => b.start)).toEqual(["09:00", "11:15", "14:00"]);
    });

    it("lists only the requested date; empty date gives []", async () => {
      const repo = make();
      await repo.create(input("10:00", "11:00", D));
      await repo.create(input("10:00", "11:00", OTHER));
      expect(await repo.listByDate(D)).toHaveLength(1);
      expect(await repo.listByDate("2030-06-12")).toEqual([]);
    });

    it("same time on different dates is not a conflict", async () => {
      const repo = make();
      await repo.create(input("10:00", "11:00", D));
      expect((await repo.create(input("10:00", "11:00", OTHER))).ok).toBe(true);
    });

    it("booking without title round-trips without a title", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      const got = await repo.getById(r.booking.id);
      expect(got).toEqual(r.booking);
      expect(got).not.toHaveProperty("title");
    });
  });

  describe("getById", () => {
    it("returns the booking or null", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      expect(await repo.getById(r.booking.id)).toEqual(r.booking);
      expect(await repo.getById("nope")).toBeNull();
    });
  });

  describe("conflicts", () => {
    it("returns the conflicting bookings and writes nothing", async () => {
      const repo = make();
      const a = await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      const c = await repo.create(input("14:00", "15:00"));
      if (!a.ok || !b.ok || !c.ok) throw new Error("unexpected");
      const r = await repo.create(input("10:30", "12:30"));
      if (r.ok || r.reason !== "conflict") throw new Error("expected conflict");
      expect(r.conflicts).toHaveLength(2);
      expect(r.conflicts).toEqual(expect.arrayContaining([a.booking, b.booking]));
      expect(await repo.listByDate(D)).toHaveLength(3);
    });

    it("identical and contained intervals conflict", async () => {
      const repo = make();
      await repo.create(input("09:00", "12:00"));
      expect(await repo.create(input("09:00", "12:00"))).toMatchObject({ ok: false, reason: "conflict" });
      expect(await repo.create(input("10:00", "10:30"))).toMatchObject({ ok: false, reason: "conflict" });
    });

    it("touching boundaries are not conflicts (both sides)", async () => {
      const repo = make();
      expect((await repo.create(input("10:00", "11:00"))).ok).toBe(true);
      expect((await repo.create(input("11:00", "12:00"))).ok).toBe(true);
      expect((await repo.create(input("09:00", "10:00"))).ok).toBe(true);
    });

    it("overlap by one step is a conflict", async () => {
      const repo = make();
      await repo.create(input("10:00", "11:00"));
      expect((await repo.create(input("10:45", "11:30"))).ok).toBe(false);
    });
  });

  describe("update", () => {
    it("replaces the booking keeping id", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00", D, "Old"));
      if (!r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("13:00", "14:00", D, "New"));
      expect(u).toEqual({
        ok: true,
        booking: { id: r.booking.id, date: D, start: "13:00", end: "14:00", title: "New" },
      });
      expect(await repo.getById(r.booking.id)).toEqual((u as { booking: Booking }).booking);
      expect(await repo.listByDate(D)).toHaveLength(1);
    });

    it("excludes itself from conflicts", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      expect((await repo.update(r.booking.id, input("10:30", "11:30"))).ok).toBe(true);
      expect(await repo.listByDate(D)).toHaveLength(1);
    });

    it("conflicts with another booking and leaves state unchanged", async () => {
      const repo = make();
      const a = await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      if (!a.ok || !b.ok) throw new Error("unexpected");
      const u = await repo.update(b.booking.id, input("10:30", "12:30"));
      expect(u).toMatchObject({ ok: false, reason: "conflict", conflicts: [a.booking] });
      expect(await repo.getById(b.booking.id)).toEqual(b.booking);
      expect(await repo.listByDate(D)).toEqual([a.booking, b.booking]);
    });

    it("touching another booking is allowed", async () => {
      const repo = make();
      await repo.create(input("10:00", "11:00"));
      const b = await repo.create(input("12:00", "13:00"));
      if (!b.ok) throw new Error("unexpected");
      expect((await repo.update(b.booking.id, input("11:00", "12:00"))).ok).toBe(true);
    });

    it("moves to another date: gone from old list, present on new", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00", D));
      if (!r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("10:00", "11:00", OTHER));
      expect(u.ok).toBe(true);
      expect(await repo.listByDate(D)).toEqual([]);
      const moved = await repo.listByDate(OTHER);
      expect(moved).toHaveLength(1);
      expect(moved[0]).toMatchObject({ id: r.booking.id, date: OTHER });
      expect(await repo.getById(r.booking.id)).toMatchObject({ date: OTHER });
      // old slot is free again
      expect((await repo.create(input("10:00", "11:00", D))).ok).toBe(true);
    });

    it("moving checks conflicts on the new date only", async () => {
      const repo = make();
      const blocker = await repo.create(input("10:00", "11:00", OTHER));
      const r = await repo.create(input("10:00", "11:00", D));
      if (!blocker.ok || !r.ok) throw new Error("unexpected");
      const u = await repo.update(r.booking.id, input("10:30", "11:30", OTHER));
      expect(u).toMatchObject({ ok: false, reason: "conflict", conflicts: [blocker.booking] });
      expect(await repo.listByDate(D)).toEqual([r.booking]);
      expect(await repo.listByDate(OTHER)).toEqual([blocker.booking]);
    });

    it("unknown id gives not_found and writes nothing", async () => {
      const repo = make();
      expect(await repo.update("nope", input("10:00", "11:00"))).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await repo.listByDate(D)).toEqual([]);
    });
  });

  describe("remove", () => {
    it("true when removed, false afterwards and for unknown ids", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      expect(await repo.remove(r.booking.id)).toBe(true);
      expect(await repo.remove(r.booking.id)).toBe(false);
      expect(await repo.remove("nope")).toBe(false);
      expect(await repo.listByDate(D)).toEqual([]);
      expect(await repo.getById(r.booking.id)).toBeNull();
    });

    it("frees the slot", async () => {
      const repo = make();
      const r = await repo.create(input("10:00", "11:00"));
      if (!r.ok) throw new Error("unexpected");
      await repo.remove(r.booking.id);
      expect((await repo.create(input("10:00", "11:00"))).ok).toBe(true);
    });
  });

  describe("race", () => {
    it("10 parallel overlapping creates: exactly one wins, rest are conflicts", async () => {
      const repo = make();
      const slots = Array.from({ length: 10 }, (_, i) =>
        // all overlap 11:00-11:15
        input(`${String(9 + (i % 3)).padStart(2, "0")}:00`, "12:00"),
      );
      const results = await Promise.all(slots.map((s) => repo.create(s)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const losers = results.filter((r) => !r.ok);
      expect(losers).toHaveLength(9);
      for (const l of losers) expect(l).toMatchObject({ ok: false, reason: "conflict" });
      expect(await repo.listByDate(D)).toHaveLength(1);
    }, 60_000);
  });
}

describe("BookingRepository contract: memory", () => {
  contract(() => new MemoryBookingRepository());
});

describe("BookingRepository contract: redis over fake client", () => {
  contract(() => new RedisBookingRepository(new FakeRedis(true), "t:"));

  it("works without a prefix too", async () => {
    const repo = new RedisBookingRepository(new FakeRedis());
    const r = await repo.create(input("10:00", "11:00"));
    expect(r.ok).toBe(true);
  });

  it("uses the documented key layout", async () => {
    const fake = new FakeRedis();
    const repo = new RedisBookingRepository(fake, "p:");
    const r = await repo.create(input("10:00", "11:00"));
    if (!r.ok) throw new Error("unexpected");
    expect(fake.strings.has(`p:booking:${r.booking.id}`)).toBe(true);
    expect(fake.hashes.get(`p:bookings:${D}`)?.has(r.booking.id)).toBe(true);
    expect(fake.strings.get(`p:bookings:${D}:ver`)).toBe("1");
  });

  it("accepts already-parsed values from an auto-deserializing client", async () => {
    const fake = new FakeRedis();
    const repo = new RedisBookingRepository(fake);
    const r = await repo.create(input("10:00", "11:00"));
    if (!r.ok) throw new Error("unexpected");
    const parsing: RedisClientLike = {
      get: async (k) => {
        const v = await fake.get(k);
        return typeof v === "string" && v.startsWith("{") ? JSON.parse(v) : v;
      },
      hgetall: async (k) => {
        const h = await fake.hgetall(k);
        return h && Object.fromEntries(Object.entries(h).map(([id, v]) => [id, JSON.parse(v as string)]));
      },
      eval: (s, k, a) => fake.eval(s, k, a),
    };
    const repo2 = new RedisBookingRepository(parsing);
    expect(await repo2.getById(r.booking.id)).toEqual(r.booking);
    expect(await repo2.listByDate(D)).toEqual([r.booking]);
  });
});

describe("RedisBookingRepository CAS retry", () => {
  /** Faithful fake whose eval can be overridden per call. */
  function scripted(results: Array<0 | "real">) {
    const fake = new FakeRedis();
    let i = 0;
    let evalCalls = 0;
    const evalArgs: Array<{ keys: string[]; args: string[] }> = [];
    const client: RedisClientLike = {
      get: (k) => fake.get(k),
      hgetall: (k) => fake.hgetall(k),
      eval: async (s, keys, args) => {
        evalCalls++;
        evalArgs.push({ keys, args });
        fake.calls.push("eval");
        const mode = results[Math.min(i++, results.length - 1)];
        return mode === 0 ? 0 : fake.runScript(keys, args);
      },
    };
    return { fake, client, evalArgs, count: () => evalCalls };
  }

  it("MAX_CAS_ATTEMPTS is 3", () => {
    expect(MAX_CAS_ATTEMPTS).toBe(3);
  });

  it("eval 0 once then success: create ok after two eval calls", async () => {
    const s = scripted([0, "real"]);
    const repo = new RedisBookingRepository(s.client);
    const r = await repo.create(input("10:00", "11:00"));
    expect(r.ok).toBe(true);
    expect(s.count()).toBe(2);
    expect(await repo.listByDate(D)).toHaveLength(1);
  });

  it("eval always 0: exactly MAX_CAS_ATTEMPTS calls, then conflict (maybe empty)", async () => {
    const s = scripted([0]);
    const repo = new RedisBookingRepository(s.client);
    const r = await repo.create(input("10:00", "11:00"));
    expect(s.count()).toBe(MAX_CAS_ATTEMPTS);
    expect(r).toMatchObject({ ok: false, reason: "conflict" });
    if (r.ok || r.reason !== "conflict") return;
    expect(r.conflicts).toEqual([]); // documented false-409 trade-off
    expect(await repo.listByDate(D)).toEqual([]);
  });

  it("exhausted retries with a non-overlapping neighbour still report empty conflicts", async () => {
    const s = scripted([0]);
    const seed = new RedisBookingRepository(s.fake);
    const a = await seed.create(input("12:00", "13:00"));
    if (!a.ok) throw new Error("unexpected");
    const repo = new RedisBookingRepository(s.client);
    const r = await repo.create(input("10:00", "11:00"));
    expect(r).toMatchObject({ ok: false, reason: "conflict", conflicts: [] });
  });

  it("reads the version before the hash on each attempt", async () => {
    const s = scripted([0, "real"]);
    const repo = new RedisBookingRepository(s.client, "p:");
    await repo.create(input("10:00", "11:00"));
    const ver = `get p:bookings:${D}:ver`;
    const hash = `hgetall p:bookings:${D}`;
    expect(s.fake.calls).toEqual([ver, hash, "eval", ver, hash, "eval"]);
  });

  it("create passes 3 keys and the expected version", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client, "p:");
    const r = await repo.create(input("10:00", "11:00"));
    if (!r.ok) throw new Error("unexpected");
    const { keys, args } = s.evalArgs[0];
    expect(keys).toEqual([`p:bookings:${D}:ver`, `p:bookings:${D}`, `p:booking:${r.booking.id}`]);
    expect(args[0]).toBe("0");
    expect(args[2]).toBe(r.booking.id);
    expect(JSON.parse(args[3])).toEqual(r.booking);
  });

  it("cross-date update passes 5 keys and both expected versions", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client, "p:");
    // old date version 2, new date version 1
    const a = await repo.create(input("10:00", "11:00", D));
    await repo.create(input("12:00", "13:00", D));
    await repo.create(input("15:00", "16:00", OTHER));
    if (!a.ok) throw new Error("unexpected");
    expect(s.fake.strings.get(`p:bookings:${D}:ver`)).toBe("2");
    expect(s.fake.strings.get(`p:bookings:${OTHER}:ver`)).toBe("1");
    s.evalArgs.length = 0;

    const u = await repo.update(a.booking.id, input("10:00", "11:00", OTHER));
    expect(u.ok).toBe(true);
    expect(s.evalArgs).toHaveLength(1);
    const { keys, args } = s.evalArgs[0];
    expect(keys).toEqual([
      `p:bookings:${OTHER}:ver`,
      `p:bookings:${OTHER}`,
      `p:booking:${a.booking.id}`,
      `p:bookings:${D}:ver`,
      `p:bookings:${D}`,
    ]);
    expect(args[0]).toBe("1");
    expect(args[1]).toBe("2");
    expect(args[2]).toBe(a.booking.id);
    // both versions bumped
    expect(s.fake.strings.get(`p:bookings:${D}:ver`)).toBe("3");
    expect(s.fake.strings.get(`p:bookings:${OTHER}:ver`)).toBe("2");
  });

  it("same-date update passes 3 keys", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client);
    const a = await repo.create(input("10:00", "11:00"));
    if (!a.ok) throw new Error("unexpected");
    s.evalArgs.length = 0;
    await repo.update(a.booking.id, input("10:30", "11:30"));
    expect(s.evalArgs[0].keys).toHaveLength(3);
  });

  it("update of an unknown id never calls eval", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client);
    expect(await repo.update("nope", input("10:00", "11:00"))).toEqual({ ok: false, reason: "not_found" });
    expect(s.count()).toBe(0);
  });

  it("remove throws under permanent contention after MAX_CAS_ATTEMPTS evals", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client);
    const a = await repo.create(input("10:00", "11:00"));
    if (!a.ok) throw new Error("unexpected");
    const contended = scripted([0]);
    contended.fake.strings.set(`booking:${a.booking.id}`, JSON.stringify(a.booking));
    const repo2 = new RedisBookingRepository(contended.client);
    await expect(repo2.remove(a.booking.id)).rejects.toThrow();
    expect(contended.count()).toBe(MAX_CAS_ATTEMPTS);
  });

  it("remove of an unknown id is false without eval", async () => {
    const s = scripted(["real"]);
    const repo = new RedisBookingRepository(s.client);
    expect(await repo.remove("nope")).toBe(false);
    expect(s.count()).toBe(0);
  });
});

// Real Redis: REDIS_TEST=1 with credentials in the environment.
const realEnabled = process.env.REDIS_TEST === "1";
describe.skipIf(!realEnabled)("BookingRepository contract: real Redis", () => {
  const resolved = resolveRedisEnv(process.env);
  const runPrefix = `test:${randomUUID()}:`;
  const client =
    resolved.status === "found"
      ? new Redis({ url: resolved.url, token: resolved.token, automaticDeserialization: false })
      : null;

  it("has credentials", () => {
    expect(resolved.status).toBe("found");
  });

  afterAll(async () => {
    if (!client) return;
    const keys = await client.keys(`${runPrefix}*`);
    if (keys.length > 0) await client.del(...keys);
  });

  contract(() => {
    if (!client) throw new Error("Redis credentials are missing");
    return new RedisBookingRepository(client as unknown as RedisClientLike, `${runPrefix}${randomUUID()}:`);
  });
});
