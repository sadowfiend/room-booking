import type { Booking, ValidationIssue } from "@/domain/booking/types";

/** Shared by the HTTP client and the route handlers. */
export const BOOKINGS_PATH = "/api/bookings";

/** Request header that makes the server answer 409 regardless of state. */
export const FORCE_CONFLICT_HEADER = "x-mock-force-conflict";

export type ListBookingsResponse = { bookings: Booking[] };

export type ApiErrorBody = {
  code: "BAD_REQUEST" | "VALIDATION" | "CONFLICT" | "NOT_FOUND";
  message: string;
  errors?: ValidationIssue[];
  conflicts?: Booking[];
};
