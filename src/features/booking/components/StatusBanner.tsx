import type { ReactNode, Ref } from "react";

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
      className={`flex flex-col gap-3 rounded-md border px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:flex-row sm:items-center sm:justify-between ${
        isError
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex flex-col gap-2">
        <p>{message}</p>
        {children}
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="self-start rounded-md border border-current px-3 py-1.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:self-auto"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
