import type {
  Booking,
  BookingInput,
  DateString,
} from "@/domain/booking/types";
import {
  BOOKINGS_PATH,
  FORCE_CONFLICT_HEADER,
  type ApiErrorBody,
  type ListBookingsResponse,
} from "./contract";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  NetworkError,
  NotFoundError,
  ValidationError,
  isAbortError,
} from "./errors";

export type RequestOptions = { signal?: AbortSignal; forceConflict?: boolean };

export interface BookingsApi {
  list(date: DateString, opts?: RequestOptions): Promise<Booking[]>;
  create(input: BookingInput, opts?: RequestOptions): Promise<Booking>;
  update(
    id: string,
    input: BookingInput,
    opts?: RequestOptions,
  ): Promise<Booking>;
  remove(id: string, opts?: RequestOptions): Promise<void>;
}

type ClientConfig = { baseUrl?: string; fetchImpl?: typeof fetch };

async function readErrorBody(res: Response): Promise<Partial<ApiErrorBody>> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function toError(res: Response): Promise<ApiError> {
  const body = await readErrorBody(res);
  const message = typeof body.message === "string" ? body.message : undefined;
  switch (res.status) {
    case 400:
      return new BadRequestError(message);
    case 422:
      return new ValidationError(asArray(body.errors), message);
    case 409:
      return new ConflictError(asArray(body.conflicts), message);
    case 404:
      return new NotFoundError(message);
    default:
      return new ApiError("UNKNOWN", undefined, res.status);
  }
}

export function createBookingsApi({
  baseUrl = "",
  fetchImpl,
}: ClientConfig = {}): BookingsApi {
  async function request(
    method: string,
    path: string,
    opts: RequestOptions = {},
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.forceConflict) headers[FORCE_CONFLICT_HEADER] = "1";

    let res: Response;
    try {
      // Resolved lazily so stubbing globalThis.fetch works.
      res = await (fetchImpl ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: opts.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted || isAbortError(e)) throw e;
      throw new NetworkError({ cause: e });
    }
    if (!res.ok) throw await toError(res);
    return res;
  }

  async function readJson<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("UNKNOWN", undefined, res.status);
    }
  }

  const itemPath = (id: string) => `${BOOKINGS_PATH}/${encodeURIComponent(id)}`;

  return {
    async list(date, opts) {
      const res = await request(
        "GET",
        `${BOOKINGS_PATH}?date=${encodeURIComponent(date)}`,
        opts,
      );
      const data = await readJson<ListBookingsResponse>(res);
      if (!Array.isArray(data?.bookings)) {
        throw new ApiError("UNKNOWN", undefined, res.status);
      }
      return data.bookings;
    },
    async create(input, opts) {
      return readJson<Booking>(await request("POST", BOOKINGS_PATH, opts, input));
    },
    async update(id, input, opts) {
      return readJson<Booking>(await request("PATCH", itemPath(id), opts, input));
    },
    async remove(id, opts) {
      await request("DELETE", itemPath(id), opts);
    },
  };
}

export const bookingsApi = createBookingsApi();
