// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./useNow";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useNow (room TZ Asia/Bishkek, UTC+6)", () => {
  it("returns room date and minutes just before local midnight", () => {
    vi.setSystemTime(new Date("2026-10-07T17:59:00Z"));
    const { result } = renderHook(() => useNow());
    expect(result.current).toEqual({ date: "2026-10-07", minutes: 23 * 60 + 59 });
  });

  it("rolls over to the next date at 18:00Z", () => {
    vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
    const { result } = renderHook(() => useNow());
    expect(result.current).toEqual({ date: "2026-10-08", minutes: 0 });
  });

  it("updates after a minute tick", () => {
    vi.setSystemTime(new Date("2026-10-07T17:59:00Z"));
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual({ date: "2026-10-08", minutes: 0 });
  });

  it("stops ticking after unmount", () => {
    vi.setSystemTime(new Date("2026-10-07T05:00:00Z"));
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
