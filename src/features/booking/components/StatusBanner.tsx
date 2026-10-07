import type { ReactNode, Ref } from "react";
import { AlertIcon, InfoIcon } from "./icons";

type Props = {
  variant: "error" | "info";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Extra content under the message, e.g. a list of conflicting bookings. */
  children?: ReactNode;
  /** Lets the parent move focus to the banner (it is focusable programmatically). */
  ref?: Ref<HTMLDivElement>;
};

export function StatusBanner({
  variant,
  message,
  actionLabel,
  onAction,
  children,
  ref,
}: Props) {
  const isError = variant === "error";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between ${
        isError
          ? "border-danger bg-danger-soft"
          : "border-accent bg-accent-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        {isError ? (
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        ) : (
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p>{message}</p>
          {children}
        </div>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-11 min-w-11 items-center justify-center self-start rounded-lg border border-current px-4 font-medium active:scale-[0.98] active:opacity-80 sm:self-auto"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
