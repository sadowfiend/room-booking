import type { ReactNode } from "react";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5 shrink-0"}
    >
      {children}
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </Icon>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  );
}

/** Decorative illustration for the empty state. */
export function EmptyCalendarIllustration({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 96"
      fill="none"
      className={className ?? "h-24 w-30"}
    >
      <rect
        x="16"
        y="16"
        width="88"
        height="68"
        rx="10"
        fill="var(--surface-muted)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <path d="M16 36h88" stroke="var(--border)" strokeWidth="2" />
      <path
        d="M38 8v16M82 8v16"
        stroke="var(--border)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="30" y="46" width="18" height="10" rx="3" fill="var(--busy)" opacity="0.35" />
      <rect x="54" y="46" width="36" height="10" rx="3" fill="var(--border)" opacity="0.35" />
      <rect x="30" y="62" width="30" height="10" rx="3" fill="var(--border)" opacity="0.35" />
    </svg>
  );
}
