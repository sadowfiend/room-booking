"use client";

import { useEffect, useRef, useState } from "react";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { ApiError, NotFoundError, isAbortError } from "@/lib/api/errors";
import { StatusBanner } from "./StatusBanner";

type Props = {
  api: BookingsApi;
  booking: Booking;
  onCancel: () => void;
  onDeleted: (booking: Booking) => void;
  /** 404: the booking is already gone. */
  onNotFound: () => void;
};

export function DeleteConfirm({
  api,
  booking,
  onCancel,
  onDeleted,
  onNotFound,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (error) bannerRef.current?.focus();
  }, [error]);

  async function confirm() {
    if (deleting) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setDeleting(true);
    setError(null);
    try {
      await api.remove(booking.id, { signal: controller.signal });
      if (controller.signal.aborted) return;
      onDeleted(booking);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      if (err instanceof NotFoundError) {
        onNotFound();
        return;
      }
      setDeleting(false);
      setError(err instanceof ApiError ? err : new ApiError("UNKNOWN"));
    }
  }

  const name = booking.title?.trim() || "Без названия";

  return (
    <div
      role="group"
      aria-label="Подтверждение удаления"
      aria-busy={deleting}
      className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4"
    >
      <p className="text-sm text-zinc-900">
        Удалить бронь «{name}» {booking.start}–{booking.end}?
      </p>
      {error ? (
        <StatusBanner
          ref={bannerRef}
          variant="error"
          message={API_ERROR_MESSAGES[error.code]}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={deleting}
          className="rounded-md bg-red-700 px-4 py-2 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {deleting ? "Удаление…" : "Удалить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
