import { findConflicts } from "@/domain/booking/rules";
import type { Booking, BookingInput, DateString } from "@/domain/booking/types";
import type { BookingRepository, WriteResult } from "./repository";

const copy = (b: Booking): Booking => ({ ...b });

/**
 * In-process storage. There is no `await` between reading and writing inside
 * `create`/`update`, so each operation is atomic within one process.
 */
export class MemoryBookingRepository implements BookingRepository {
  readonly kind = "memory" as const;
  private readonly bookings = new Map<string, Booking>();

  async listByDate(date: DateString): Promise<Booking[]> {
    return [...this.bookings.values()]
      .filter((b) => b.date === date)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(copy);
  }

  async getById(id: string): Promise<Booking | null> {
    const found = this.bookings.get(id);
    return found ? copy(found) : null;
  }

  async create(input: BookingInput): Promise<WriteResult> {
    const conflicts = findConflicts(input, [...this.bookings.values()]);
    if (conflicts.length > 0) {
      return { ok: false, reason: "conflict", conflicts: conflicts.map(copy) };
    }
    const booking: Booking = { ...input, id: crypto.randomUUID() };
    this.bookings.set(booking.id, booking);
    return { ok: true, booking: copy(booking) };
  }

  async update(id: string, input: BookingInput): Promise<WriteResult> {
    if (!this.bookings.has(id)) return { ok: false, reason: "not_found" };
    const conflicts = findConflicts(input, [...this.bookings.values()], id);
    if (conflicts.length > 0) {
      return { ok: false, reason: "conflict", conflicts: conflicts.map(copy) };
    }
    const booking: Booking = { ...input, id };
    this.bookings.set(id, booking);
    return { ok: true, booking: copy(booking) };
  }

  async remove(id: string): Promise<boolean> {
    return this.bookings.delete(id);
  }
}

const globalKey = Symbol.for("room-booking.memory-repository");
type GlobalWithRepo = typeof globalThis & {
  [globalKey]?: MemoryBookingRepository;
};

/** Singleton kept on `globalThis` so it survives HMR. */
export function getMemoryRepository(): MemoryBookingRepository {
  const g = globalThis as GlobalWithRepo;
  g[globalKey] ??= new MemoryBookingRepository();
  return g[globalKey];
}
