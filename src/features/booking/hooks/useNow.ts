"use client";

import { useEffect, useState } from "react";
import { ROOM_TIME_ZONE } from "@/domain/booking/config";
import { getZonedNow } from "@/domain/booking/time";
import type { ZonedNow } from "@/domain/booking/types";

const TICK_MS = 60_000;

/** Current time in the room time zone. `null` until mounted on the client. */
export function useNow(): ZonedNow | null {
  const [now, setNow] = useState<ZonedNow | null>(null);

  useEffect(() => {
    const update = () => {
      const next = getZonedNow(new Date(), ROOM_TIME_ZONE);
      setNow((prev) =>
        prev && prev.date === next.date && prev.minutes === next.minutes
          ? prev
          : next,
      );
    };
    update();
    const id = setInterval(update, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}
