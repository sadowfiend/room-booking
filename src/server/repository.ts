import type { Booking, BookingInput, DateString } from "@/domain/booking/types";

export type WriteResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "conflict"; conflicts: Booking[] }
  | { ok: false; reason: "not_found" };

/**
 * Storage port. `create` and `update` must run the overlap check
 * (domain `findConflicts`) and the write as one atomic operation.
 */
export interface BookingRepository {
  readonly kind: "memory" | "redis";
  /** Bookings of one date, sorted by start. */
  listByDate(date: DateString): Promise<Booking[]>;
  getById(id: string): Promise<Booking | null>;
  create(input: BookingInput): Promise<WriteResult>;
  /** Replaces the booking (may move it to another date); it never conflicts with itself. */
  update(id: string, input: BookingInput): Promise<WriteResult>;
  /** Returns false when the booking does not exist. */
  remove(id: string): Promise<boolean>;
}
