// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { BookingPage } from "./BookingPage";

// 2026-10-07T05:30Z = 11:30 in Asia/Bishkek
const NOW = new Date("2026-10-07T05:30:00Z");
const TODAY = "2026-10-07";

const bk = (id: string, start: string, end: string, title: string, date = TODAY): Booking => ({
  id, date, start, end, title,
});

function makeApi(impl: BookingsApi["list"] = async () => []) {
  const list = vi.fn(impl);
  const api: BookingsApi = { list, create: vi.fn(), update: vi.fn(), remove: vi.fn() };
  return { api, list };
}

const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("BookingPage", () => {
  it("defaults the date to today in room TZ and requests it", async () => {
    // 18:00Z on the 7th is already the 8th in Bishkek
    vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
    const { api, list } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-08");
    expect(list).toHaveBeenCalledWith("2026-10-08", expect.anything());
  });

  it("shows busy skeleton while loading, then the list", async () => {
    let resolve!: (v: Booking[]) => void;
    const { api } = makeApi(() => new Promise((r) => { resolve = r; }));
    render(<BookingPage api={api} />);
    await flush();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await act(async () => resolve([bk("1", "09:00", "10:00", "Standup")]));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("прошла")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    const { api } = makeApi(async () => []);
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.getByText("На эту дату бронирований нет")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows error banner with API message and retry reloads", async () => {
    const { api, list } = makeApi(async () => []);
    list.mockRejectedValueOnce(new NetworkError());
    render(<BookingPage api={api} />);
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(API_ERROR_MESSAGES.NETWORK);
    list.mockResolvedValueOnce([bk("1", "14:00", "15:00", "Retro")]);
    fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Retro")).toBeInTheDocument();
  });

  it("uses message for UNKNOWN errors", async () => {
    const { api } = makeApi(() => Promise.reject(new ApiError("UNKNOWN")));
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(API_ERROR_MESSAGES.UNKNOWN);
  });

  it("changing the date while pending ignores the stale response", async () => {
    const resolvers: Record<string, (v: Booking[]) => void> = {};
    const signals: Record<string, AbortSignal | undefined> = {};
    const { api } = makeApi((date, opts) => {
      signals[date] = opts?.signal;
      return new Promise((r) => { resolvers[date] = r; });
    });
    render(<BookingPage api={api} />);
    await flush();
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-09" } });
    await flush();
    expect(signals[TODAY]?.aborted).toBe(true);
    await act(async () => resolvers["2026-10-09"]([bk("n", "10:00", "11:00", "New", "2026-10-09")]));
    await act(async () => resolvers[TODAY]([bk("o", "10:00", "11:00", "Old")]));
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Old")).toBeNull();
  });

  it("labels: today ongoing/past/future, and updates after the minute tick", async () => {
    const { api } = makeApi(async () => [
      bk("1", "09:00", "10:00", "Past"),
      bk("2", "11:00", "12:00", "Ongoing"),
      bk("3", "11:45", "12:30", "Soon"),
    ]);
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.getAllByText("прошла")).toHaveLength(1);
    expect(screen.getAllByText("идёт")).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000);
    });
    expect(screen.getAllByText("идёт")).toHaveLength(2);
  });

  it("aborts the in-flight request on unmount", async () => {
    let signal: AbortSignal | undefined;
    const { api } = makeApi((_d, opts) => {
      signal = opts?.signal;
      return new Promise(() => {});
    });
    const { unmount } = render(<BookingPage api={api} />);
    await flush();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
