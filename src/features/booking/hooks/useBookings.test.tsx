// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { useBookings } from "./useBookings";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const bk = (id: string, date: string): Booking => ({ id, date, start: "09:00", end: "10:00" });

function makeApi(list: BookingsApi["list"]) {
  const listFn = vi.fn(list);
  const api: BookingsApi = {
    list: listFn,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  return { api, list: listFn };
}

const flush = () => act(async () => {});

describe("useBookings", () => {
  it("loading then data", async () => {
    const d = deferred<Booking[]>();
    const { api, list } = makeApi(() => d.promise);
    const { result } = renderHook(() => useBookings("2026-10-07", { api }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.bookings).toBeNull();
    expect(list).toHaveBeenCalledWith("2026-10-07", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => d.resolve([bk("1", "2026-10-07")]));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.bookings).toEqual([bk("1", "2026-10-07")]);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch while date is null", () => {
    const { api, list } = makeApi(async () => []);
    const { result } = renderHook(() => useBookings(null, { api }));
    expect(list).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });

  it("error then reload succeeds", async () => {
    const { api, list } = makeApi(async () => []);
    list.mockRejectedValueOnce(new NetworkError());
    const { result } = renderHook(() => useBookings("2026-10-07", { api }));
    await flush();
    expect(result.current.error?.code).toBe("NETWORK");
    expect(result.current.bookings).toBeNull();
    list.mockResolvedValueOnce([bk("1", "2026-10-07")]);
    act(() => result.current.reload());
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.bookings).toHaveLength(1);
  });

  it("stale response for old date does not overwrite new date; old signal aborted", async () => {
    const a = deferred<Booking[]>();
    const bD = deferred<Booking[]>();
    const { api, list } = makeApi((date) => (date === "2026-10-07" ? a.promise : bD.promise));
    const { result, rerender } = renderHook(({ date }) => useBookings(date, { api }), {
      initialProps: { date: "2026-10-07" },
    });
    const signalA = list.mock.calls[0][1]?.signal as AbortSignal;
    rerender({ date: "2026-10-08" });
    expect(signalA.aborted).toBe(true);
    await act(async () => bD.resolve([bk("b", "2026-10-08")]));
    await act(async () => a.resolve([bk("a", "2026-10-07")]));
    expect(result.current.bookings).toEqual([bk("b", "2026-10-08")]);
  });

  it("stale error for old date is ignored", async () => {
    const a = deferred<Booking[]>();
    const bD = deferred<Booking[]>();
    const { api } = makeApi((date) => (date === "2026-10-07" ? a.promise : bD.promise));
    const { result, rerender } = renderHook(({ date }) => useBookings(date, { api }), {
      initialProps: { date: "2026-10-07" },
    });
    rerender({ date: "2026-10-08" });
    await act(async () => bD.resolve([]));
    await act(async () => a.reject(new NetworkError()));
    expect(result.current.error).toBeNull();
    expect(result.current.bookings).toEqual([]);
  });

  it("date switch shows no old data while new date loads", async () => {
    const bD = deferred<Booking[]>();
    const { api } = makeApi((date) =>
      date === "2026-10-07" ? Promise.resolve([bk("a", "2026-10-07")]) : bD.promise,
    );
    const { result, rerender } = renderHook(({ date }) => useBookings(date, { api }), {
      initialProps: { date: "2026-10-07" },
    });
    await flush();
    rerender({ date: "2026-10-08" });
    expect(result.current.bookings).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("abort rejection (AbortError) after abort gives no error state", async () => {
    const a = deferred<Booking[]>();
    const bD = deferred<Booking[]>();
    const { api } = makeApi((date) => (date === "2026-10-07" ? a.promise : bD.promise));
    const { result, rerender } = renderHook(({ date }) => useBookings(date, { api }), {
      initialProps: { date: "2026-10-07" },
    });
    rerender({ date: "2026-10-08" });
    await act(async () => a.reject(new DOMException("aborted", "AbortError")));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("ApiError UNKNOWN after abort gives no error state", async () => {
    const a = deferred<Booking[]>();
    const bD = deferred<Booking[]>();
    const { api } = makeApi((date) => (date === "2026-10-07" ? a.promise : bD.promise));
    const { result, rerender } = renderHook(({ date }) => useBookings(date, { api }), {
      initialProps: { date: "2026-10-07" },
    });
    rerender({ date: "2026-10-08" });
    await act(async () => a.reject(new ApiError("UNKNOWN")));
    expect(result.current.error).toBeNull();
    await act(async () => bD.resolve([bk("b", "2026-10-08")]));
    expect(result.current.error).toBeNull();
    expect(result.current.bookings).toHaveLength(1);
  });

  it("refresh keeps previous data for the same date", async () => {
    const second = deferred<Booking[]>();
    const { api, list } = makeApi(async () => [bk("1", "2026-10-07")]);
    const { result } = renderHook(() => useBookings("2026-10-07", { api }));
    await flush();
    list.mockReturnValueOnce(second.promise);
    act(() => result.current.reload());
    expect(result.current.bookings).toEqual([bk("1", "2026-10-07")]);
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);
    await act(async () => second.resolve([bk("2", "2026-10-07")]));
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.bookings).toEqual([bk("2", "2026-10-07")]);
  });

  it("failed refresh keeps data and exposes error", async () => {
    const { api, list } = makeApi(async () => [bk("1", "2026-10-07")]);
    const { result } = renderHook(() => useBookings("2026-10-07", { api }));
    await flush();
    list.mockRejectedValueOnce(new NetworkError());
    act(() => result.current.reload());
    await flush();
    expect(result.current.error?.code).toBe("NETWORK");
    expect(result.current.bookings).toEqual([bk("1", "2026-10-07")]);
  });

  it("non-ApiError failure maps to UNKNOWN", async () => {
    const { api } = makeApi(() => Promise.reject(new Error("boom")));
    const { result } = renderHook(() => useBookings("2026-10-07", { api }));
    await flush();
    expect(result.current.error?.code).toBe("UNKNOWN");
  });

  it("unmount aborts in-flight request", () => {
    const d = deferred<Booking[]>();
    const { api, list } = makeApi(() => d.promise);
    const { unmount } = renderHook(() => useBookings("2026-10-07", { api }));
    const signal = list.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
