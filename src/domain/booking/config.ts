/** Single source of truth for booking constants. */

export const WORKDAY_START = "09:00";
export const WORKDAY_END = "18:00";
export const SLOT_STEP_MINUTES = 30;
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 120;
export const TITLE_MAX_LENGTH = 100;
export const DEFAULT_ROOM_TIME_ZONE = "Asia/Bishkek";

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Returns `value` if it is a valid IANA time zone, otherwise the default. */
export function resolveRoomTimeZone(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && isValidTimeZone(trimmed) ? trimmed : DEFAULT_ROOM_TIME_ZONE;
}

// Referenced literally so Next.js inlines the value into the client bundle.
export const ROOM_TIME_ZONE = resolveRoomTimeZone(
  process.env.NEXT_PUBLIC_ROOM_TZ,
);
