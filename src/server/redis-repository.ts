import { findConflicts } from "@/domain/booking/rules";
import type { Booking, BookingInput, DateString } from "@/domain/booking/types";
import { CAS_WRITE_SCRIPT } from "./redis-scripts";
import type { BookingRepository, WriteResult } from "./repository";

/** The only client methods the repository uses (a fake can implement them). */
export interface RedisClientLike {
  get(key: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export const MAX_CAS_ATTEMPTS = 3;

/** Values may arrive as JSON strings or already parsed (client auto-deserialization). */
function parseBooking(value: unknown): Booking | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Booking;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Booking) : null;
}

const toVersion = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Redis storage with optimistic locking: read versions + data, check overlaps
 * in TS (domain `findConflicts`), then write through a Lua compare-version
 * script. A version mismatch means someone wrote in between, so we re-read and
 * retry.
 *
 * Trade-off: after MAX_CAS_ATTEMPTS mismatches in a row we give up and report a
 * conflict built from freshly read data. Under heavy contention on one date
 * that conflict list can be empty (a false 409); resubmitting succeeds.
 */
export class RedisBookingRepository implements BookingRepository {
  readonly kind = "redis" as const;

  constructor(
    private readonly redis: RedisClientLike,
    private readonly prefix = "",
  ) {}

  private bookingKey = (id: string) => `${this.prefix}booking:${id}`;
  private hashKey = (date: DateString) => `${this.prefix}bookings:${date}`;
  private verKey = (date: DateString) => `${this.prefix}bookings:${date}:ver`;

  private async readVersion(date: DateString): Promise<number> {
    return toVersion(await this.redis.get(this.verKey(date)));
  }

  private async readDate(date: DateString): Promise<Booking[]> {
    const hash = await this.redis.hgetall(this.hashKey(date));
    if (!hash) return [];
    return Object.values(hash)
      .map(parseBooking)
      .filter((b): b is Booking => b !== null);
  }

  async listByDate(date: DateString): Promise<Booking[]> {
    const all = await this.readDate(date);
    return all.sort((a, b) => a.start.localeCompare(b.start));
  }

  async getById(id: string): Promise<Booking | null> {
    return parseBooking(await this.redis.get(this.bookingKey(id)));
  }

  create(input: BookingInput): Promise<WriteResult> {
    const id = crypto.randomUUID();
    return this.write(input, id, async () => ({ kind: "ok", oldDate: null }));
  }

  update(id: string, input: BookingInput): Promise<WriteResult> {
    return this.write(input, id, async () => {
      // Read order matters: the old date's version first, then the booking
      // again. A removal/move that happened before the version read is seen in
      // the second read; one after it bumps the version and fails the CAS.
      const first = await this.getById(id);
      if (!first) return { kind: "not_found" };
      const oldVersion = await this.readVersion(first.date);
      const second = await this.getById(id);
      if (!second) return { kind: "not_found" };
      if (second.date !== first.date) return { kind: "retry" };
      return { kind: "ok", oldDate: { date: second.date, version: oldVersion } };
    });
  }

  async remove(id: string): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      const first = await this.getById(id);
      if (!first) return false;
      const version = await this.readVersion(first.date);
      const second = await this.getById(id);
      if (!second) return false;
      if (second.date !== first.date) continue;
      const done = await this.eval(
        [this.verKey(second.date), this.hashKey(second.date), this.bookingKey(id)],
        [String(version), "", id, ""],
      );
      if (done) return true;
    }
    // Not a "not found": surface persistent contention as a server error.
    throw new Error("Redis contention: could not remove booking");
  }

  private async eval(keys: string[], args: string[]): Promise<boolean> {
    return Number(await this.redis.eval(CAS_WRITE_SCRIPT, keys, args)) === 1;
  }

  /**
   * Shared create/update flow. `prepare` yields the old-date version for an
   * existing booking (null for create) or a terminal/retry marker.
   */
  private async write(
    input: BookingInput,
    id: string,
    prepare: () => Promise<
      | { kind: "ok"; oldDate: { date: DateString; version: number } | null }
      | { kind: "not_found" }
      | { kind: "retry" }
    >,
  ): Promise<WriteResult> {
    const booking: Booking = { ...input, id };
    const json = JSON.stringify(booking);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      const prepared = await prepare();
      if (prepared.kind === "not_found") return { ok: false, reason: "not_found" };
      if (prepared.kind === "retry") continue;
      const { oldDate } = prepared;
      // Cross-date move: the old date is the secondary one in the script.
      const moved = oldDate !== null && oldDate.date !== input.date;
      // Version before data: a write in between makes the CAS fail, never lie.
      // Same-date update reuses the version read inside `prepare` (before the
      // booking was re-read), otherwise a concurrent remove could be missed.
      const version =
        oldDate !== null && !moved
          ? oldDate.version
          : await this.readVersion(input.date);
      const existing = await this.readDate(input.date);
      const conflicts = findConflicts(input, existing, id);
      if (conflicts.length > 0) return { ok: false, reason: "conflict", conflicts };

      const keys = [this.verKey(input.date), this.hashKey(input.date), this.bookingKey(id)];
      const args = [String(version), "", id, json];
      if (moved) {
        keys.push(this.verKey(oldDate.date), this.hashKey(oldDate.date));
        args[1] = String(oldDate.version);
      }
      if (await this.eval(keys, args)) return { ok: true, booking };
    }
    // Retries exhausted: report the freshly read state (see class comment).
    const fresh = await this.readDate(input.date);
    return {
      ok: false,
      reason: "conflict",
      conflicts: findConflicts(input, fresh, id),
    };
  }
}
