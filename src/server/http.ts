import { FORCE_CONFLICT_HEADER } from "@/lib/api/contract";
import type { ApiErrorBody, ListBookingsResponse } from "@/lib/api/contract";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";
import type {
  RequestContext,
  ServiceError,
  ServiceResult,
} from "./booking-service";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorResponse(
  code: ApiErrorBody["code"],
  extra: Pick<ApiErrorBody, "errors" | "conflicts"> = {},
): Response {
  const status = { BAD_REQUEST: 400, VALIDATION: 422, CONFLICT: 409, NOT_FOUND: 404 }[code];
  const body: ApiErrorBody = {
    code,
    message: API_ERROR_MESSAGES[code],
    ...extra,
  };
  return json(body, status);
}

export function serviceErrorResponse(error: ServiceError): Response {
  switch (error.code) {
    case "VALIDATION":
      return errorResponse("VALIDATION", { errors: error.errors });
    case "CONFLICT":
      return errorResponse("CONFLICT", { conflicts: error.conflicts });
    case "NOT_FOUND":
      return errorResponse("NOT_FOUND");
  }
}

/** Maps a service result to a Response; `onOk` builds the success response. */
export function toResponse<T>(
  result: ServiceResult<T>,
  onOk: (value: T) => Response,
): Response {
  return result.ok ? onOk(result.value) : serviceErrorResponse(result.error);
}

export const listResponse = (bookings: Booking[]): Response =>
  json({ bookings } satisfies ListBookingsResponse, 200);
export const createdResponse = (booking: Booking): Response => json(booking, 201);
export const okResponse = (booking: Booking): Response => json(booking, 200);
export const noContentResponse = (): Response =>
  new Response(null, { status: 204, headers: NO_STORE });

export function getRequestContext(request: Request): RequestContext {
  return { forceConflict: request.headers.has(FORCE_CONFLICT_HEADER) };
}

/** Reads a JSON body; yields a 400 Response on wrong Content-Type or broken JSON. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    return { ok: false, response: errorResponse("BAD_REQUEST") };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: errorResponse("BAD_REQUEST") };
  }
}
