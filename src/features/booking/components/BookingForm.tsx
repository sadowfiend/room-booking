"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  API_ERROR_MESSAGES,
  SLOT_BUSY_MESSAGE,
  VALIDATION_MESSAGES,
  type ApiErrorCode,
} from "@/domain/booking/messages";
import { parseBookingInput } from "@/domain/booking/parse";
import { findConflicts, validateBooking } from "@/domain/booking/rules";
import type {
  Booking,
  BookingField,
  BookingInput,
  DateString,
  ValidationIssue,
  ZonedNow,
} from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
  isAbortError,
} from "@/lib/api/errors";
import { DevConflictToggle } from "./DevConflictToggle";
import { StatusBanner } from "./StatusBanner";
import { TimeSlotPicker } from "./TimeSlotPicker";

type Props = {
  api: BookingsApi;
  /** Date being booked (the date selected on the page). */
  date: DateString;
  /** Bookings already on `date`. */
  existing: Booking[];
  now: ZonedNow;
  /** Present in edit mode; absent in create mode. */
  original?: Booking;
  /** Refreshes the list (called after a 409). */
  reload: () => void;
  onCancel: () => void;
  onSaved: (booking: Booking, mode: "create" | "edit") => void;
  /** 404 on update: the booking no longer exists. */
  onNotFound: () => void;
};

type Banner = { code: ApiErrorCode; conflicts: Booking[] };

function formatRange(b: Booking): string {
  return `${b.start}–${b.end}${b.title ? ` ${b.title}` : ""}`;
}

export function BookingForm({
  api,
  date,
  existing,
  now,
  original,
  reload,
  onCancel,
  onSaved,
  onNotFound,
}: Props) {
  const mode = original ? "edit" : "create";
  const titleId = useId();
  const titleErrorId = `${titleId}-error`;

  const [start, setStart] = useState<string>(original?.start ?? "");
  const [end, setEnd] = useState<string>(original?.end ?? "");
  const [title, setTitle] = useState(original?.title ?? "");
  const [forceConflict, setForceConflict] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);

  const bannerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Ignore results of a request that is still in flight when the form goes away.
  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (banner) bannerRef.current?.focus();
  }, [banner]);

  // Local checks use the same domain functions as the server.
  const parsed = parseBookingInput({ date, start, end, title });
  let localIssues: ValidationIssue[];
  let busy: Booking[] = [];
  if (parsed.ok) {
    localIssues = validateBooking(parsed.value, { now, original });
    if (localIssues.length === 0) {
      busy = findConflicts(parsed.value, existing, original?.id);
    }
  } else {
    // Empty time selects are reported only after the first submit attempt.
    localIssues = parsed.error.filter(
      (i) => attempted || i.code !== "INVALID_TIME",
    );
  }

  const issues = [...localIssues, ...serverIssues];
  const fieldError = (field: BookingField): string | undefined => {
    const issue = issues.find((i) => i.field === field);
    if (issue) return VALIDATION_MESSAGES[issue.code];
    if (field === "end" && busy.length > 0) return SLOT_BUSY_MESSAGE;
    return undefined;
  };
  const formIssues = issues.filter((i) => !i.field || i.field === "date");

  const clearServerState = () => {
    setServerIssues([]);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setAttempted(true);
    setBanner(null);
    if (!parsed.ok || localIssues.length > 0 || busy.length > 0) return;

    const input: BookingInput = parsed.value;
    const controller = new AbortController();
    controllerRef.current = controller;
    const opts = { signal: controller.signal, forceConflict };

    setSubmitting(true);
    setServerIssues([]);
    try {
      const saved = original
        ? await api.update(original.id, input, opts)
        : await api.create(input, opts);
      if (controller.signal.aborted) return;
      onSaved(saved, mode);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setSubmitting(false);
      if (err instanceof NotFoundError) {
        reload();
        onNotFound();
      } else if (err instanceof ConflictError) {
        setBanner({ code: "CONFLICT", conflicts: err.conflicts });
        reload();
      } else if (err instanceof ValidationError) {
        setServerIssues(err.issues);
        setBanner({ code: "VALIDATION", conflicts: [] });
      } else {
        const code = err instanceof ApiError ? err.code : "UNKNOWN";
        setBanner({ code, conflicts: [] });
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={submitting}
      aria-label={mode === "edit" ? "Редактирование брони" : "Новая бронь"}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pt-5 max-sm:pr-[max(1rem,env(safe-area-inset-right))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:pl-[max(1rem,env(safe-area-inset-left))] max-sm:shadow-[0_-8px_32px_rgb(0_0_0/0.3)]"
    >
      <h2 className="text-lg font-semibold text-text">
        {mode === "edit" ? "Редактирование брони" : "Новая бронь"}
        <span className="ml-2 text-sm font-normal text-muted">{date}</span>
      </h2>

      {banner ? (
        <StatusBanner
          ref={bannerRef}
          variant="error"
          message={API_ERROR_MESSAGES[banner.code]}
        >
          {banner.code === "CONFLICT" && banner.conflicts.length > 0 ? (
            <ul className="list-disc pl-5">
              {banner.conflicts.map((c) => (
                <li key={c.id}>{formatRange(c)}</li>
              ))}
            </ul>
          ) : null}
        </StatusBanner>
      ) : null}

      {formIssues.length > 0 ? (
        <ul role="alert" className="list-disc pl-5 text-sm text-danger">
          {formIssues.map((i, idx) => (
            <li key={`${i.code}-${idx}`}>{VALIDATION_MESSAGES[i.code]}</li>
          ))}
        </ul>
      ) : null}

      <fieldset disabled={submitting} className="flex flex-col gap-4 border-0 p-0">
        <TimeSlotPicker
          date={date}
          existing={existing}
          now={now}
          original={original}
          start={start}
          end={end}
          onStartChange={(v) => {
            setStart(v);
            clearServerState();
          }}
          onEndChange={(v) => {
            setEnd(v);
            clearServerState();
          }}
          startError={fieldError("start")}
          endError={fieldError("end")}
          disabled={submitting}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor={titleId} className="text-sm font-medium text-muted">
            Название (необязательно)
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            aria-invalid={fieldError("title") ? true : undefined}
            aria-describedby={fieldError("title") ? titleErrorId : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              clearServerState();
            }}
            className={`min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-base text-text ${fieldError("title") ? "border-danger" : "border-border"}`}
          />
          {fieldError("title") ? (
            <p id={titleErrorId} className="text-sm text-danger">
              {fieldError("title")}
            </p>
          ) : null}
        </div>

        <DevConflictToggle checked={forceConflict} onChange={setForceConflict} />
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-medium text-on-accent hover:opacity-90 active:scale-[0.98] active:opacity-80 disabled:opacity-60"
        >
          {submitting ? "Отправка…" : mode === "edit" ? "Сохранить" : "Забронировать"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-medium text-text hover:bg-surface-muted active:scale-[0.98] active:bg-surface-muted disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
