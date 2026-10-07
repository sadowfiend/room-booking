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
      className="flex flex-col gap-3 rounded-xl border border-danger bg-danger-soft p-4"
    >
      <p className="text-sm text-text">
        Удалить бронь «{name}» {booking.start}–{booking.end}?
      </p>
      {error ? (
        <StatusBanner
          ref={bannerRef}
          variant="error"
          message={API_ERROR_MESSAGES[error.code]}
        />
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={deleting}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-danger px-5 font-medium text-on-accent hover:opacity-90 active:scale-[0.98] active:opacity-80 disabled:opacity-60"
        >
          {deleting ? "Удаление…" : "Удалить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-medium text-text hover:bg-surface-muted active:scale-[0.98] active:bg-surface-muted disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
