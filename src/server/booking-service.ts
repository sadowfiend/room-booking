import { ROOM_TIME_ZONE } from "@/domain/booking/config";
import { parseBookingInput } from "@/domain/booking/parse";
import { findConflicts, validateBooking } from "@/domain/booking/rules";
import { getZonedNow, isValidDateString } from "@/domain/booking/time";
import type {
  Booking,
  BookingInput,
  ValidationIssue,
} from "@/domain/booking/types";
import type { BookingRepository } from "./repository";

export type ServiceError =
  | { code: "VALIDATION"; errors: ValidationIssue[] }
  | { code: "CONFLICT"; conflicts: Booking[] }
  | { code: "NOT_FOUND" };

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export type RequestContext = {
  /** True when the request carries the force-conflict header. */
  forceConflict?: boolean;
};

export type BookingService = {
  list(date: string | null): Promise<ServiceResult<Booking[]>>;
  create(raw: unknown, ctx?: RequestContext): Promise<ServiceResult<Booking>>;
  update(
    id: string,
    raw: unknown,
    ctx?: RequestContext,
  ): Promise<ServiceResult<Booking>>;
  remove(id: string): Promise<ServiceResult<null>>;
};

export type BookingServiceOptions = {
  /** Clock, injectable for tests. */
  now?: () => Date;
  /** Whether the force-conflict header is honoured; defaults to the env flag. */
  allowForcedConflict?: () => boolean;
};

const fail = (error: ServiceError): { ok: false; error: ServiceError } => ({
  ok: false,
  error,
});

export function createBookingService(
  repo: BookingRepository,
  options: BookingServiceOptions = {},
): BookingService {
  const clock = options.now ?? (() => new Date());
  const allowForced =
    options.allowForcedConflict ??
    (() => process.env.MOCK_ALLOW_FORCED_CONFLICT === "1");
  const zonedNow = () => getZonedNow(clock(), ROOM_TIME_ZONE);

  /**
   * Forced 409 reports the real overlapping bookings of that date
   * (possibly an empty array when the slot is actually free).
   */
  async function forcedConflict(
    input: BookingInput,
    ctx: RequestContext | undefined,
  ): Promise<ServiceError | null> {
    if (!ctx?.forceConflict || !allowForced()) return null;
    const existing = await repo.listByDate(input.date);
    return { code: "CONFLICT", conflicts: findConflicts(input, existing) };
  }

  return {
    async list(date) {
      if (date === null || !isValidDateString(date)) {
        return fail({
          code: "VALIDATION",
          errors: [{ field: "date", code: "INVALID_DATE" }],
        });
      }
      return { ok: true, value: await repo.listByDate(date) };
    },

    async create(raw, ctx) {
      const parsed = parseBookingInput(raw);
      if (!parsed.ok) return fail({ code: "VALIDATION", errors: parsed.error });
      const errors = validateBooking(parsed.value, { now: zonedNow() });
      if (errors.length > 0) return fail({ code: "VALIDATION", errors });
      const forced = await forcedConflict(parsed.value, ctx);
      if (forced) return fail(forced);
      const result = await repo.create(parsed.value);
      if (result.ok) return { ok: true, value: result.booking };
      if (result.reason === "conflict") {
        return fail({ code: "CONFLICT", conflicts: result.conflicts });
      }
      return fail({ code: "NOT_FOUND" });
    },

    async update(id, raw, ctx) {
      const parsed = parseBookingInput(raw);
      if (!parsed.ok) return fail({ code: "VALIDATION", errors: parsed.error });
      const original = await repo.getById(id);
      if (!original) return fail({ code: "NOT_FOUND" });
      const errors = validateBooking(parsed.value, {
        now: zonedNow(),
        original,
      });
      if (errors.length > 0) return fail({ code: "VALIDATION", errors });
      const forced = await forcedConflict(parsed.value, ctx);
      if (forced) return fail(forced);
      const result = await repo.update(id, parsed.value);
      if (result.ok) return { ok: true, value: result.booking };
      if (result.reason === "conflict") {
        return fail({ code: "CONFLICT", conflicts: result.conflicts });
      }
      return fail({ code: "NOT_FOUND" });
    },

    async remove(id) {
      const removed = await repo.remove(id);
      return removed ? { ok: true, value: null } : fail({ code: "NOT_FOUND" });
    },
  };
}
