import { API_ERROR_MESSAGES, type ApiErrorCode } from "@/domain/booking/messages";
import type { Booking, ValidationIssue } from "@/domain/booking/types";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(
    code: ApiErrorCode,
    message?: string,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message || API_ERROR_MESSAGES[code], options);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export class BadRequestError extends ApiError {
  constructor(message?: string) {
    super("BAD_REQUEST", message, 400);
    this.name = "BadRequestError";
  }
}

export class ValidationError extends ApiError {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[] = [], message?: string) {
    super("VALIDATION", message, 422);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class ConflictError extends ApiError {
  readonly conflicts: Booking[];

  constructor(conflicts: Booking[] = [], message?: string) {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
    this.conflicts = conflicts;
  }
}

export class NotFoundError extends ApiError {
  constructor(message?: string) {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

/** The request never got a response (fetch rejected). */
export class NetworkError extends ApiError {
  constructor(options?: ErrorOptions) {
    super("NETWORK", undefined, undefined, options);
    this.name = "NetworkError";
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "AbortError"
  );
}
