"use client";

import { useCallback, useEffect, useState } from "react";
import type { Booking, DateString } from "@/domain/booking/types";
import { bookingsApi, type BookingsApi } from "@/lib/api/bookings";
import { ApiError, isAbortError } from "@/lib/api/errors";

type Settled = {
  date: DateString;
  seq: number;
  /** Last successfully loaded bookings for `date`. */
  bookings: Booking[] | null;
  error: ApiError | null;
};

export type UseBookingsResult = {
  /** Bookings for the requested date, or `null` while nothing is loaded for it. */
  bookings: Booking[] | null;
  /** A request is in flight (initial load or refresh). */
  isFetching: boolean;
  /** Fetching with nothing to show for the requested date. */
  isLoading: boolean;
  /** Fetching while previous data for the same date is still shown. */
  isRefreshing: boolean;
  error: ApiError | null;
  reload: () => void;
};

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError("UNKNOWN");
}

export function useBookings(
  date: DateString | null,
  { api = bookingsApi }: { api?: BookingsApi } = {},
): UseBookingsResult {
  const [seq, setSeq] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (date === null) return;
    const controller = new AbortController();
    const { signal } = controller;

    api
      .list(date, { signal })
      .then((bookings) => {
        if (signal.aborted) return;
        setSettled({ date, seq, bookings, error: null });
      })
      .catch((e: unknown) => {
        // A cancel during body read may surface as ApiError UNKNOWN.
        if (signal.aborted || isAbortError(e)) return;
        const error = toApiError(e);
        setSettled((prev) => ({
          date,
          seq,
          bookings: prev && prev.date === date ? prev.bookings : null,
          error,
        }));
      });

    return () => controller.abort();
  }, [api, date, seq]);

  const reload = useCallback(() => setSeq((n) => n + 1), []);

  const sameDate = settled !== null && settled.date === date;
  const bookings = sameDate ? settled.bookings : null;
  const isFetching = date === null || !sameDate || settled.seq !== seq;
  const error = !isFetching && sameDate ? settled.error : null;

  return {
    bookings,
    isFetching,
    isLoading: isFetching && bookings === null,
    isRefreshing: isFetching && bookings !== null,
    error,
    reload,
  };
}
