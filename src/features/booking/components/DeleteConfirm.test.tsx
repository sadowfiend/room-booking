// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES } from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { NetworkError, NotFoundError } from "@/lib/api/errors";
import { DeleteConfirm } from "./DeleteConfirm";

const booking: Booking = { id: "b1", date: "2026-10-09", start: "10:00", end: "11:00", title: "Sync" };

function setup(remove: BookingsApi["remove"] = async () => {}) {
  const api: BookingsApi = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(remove),
  };
  const cbs = { onCancel: vi.fn(), onDeleted: vi.fn(), onNotFound: vi.fn() };
  const utils = render(<DeleteConfirm api={api} booking={booking} {...cbs} />);
  return { api, ...cbs, ...utils };
}

describe("DeleteConfirm", () => {
  it("mentions the booking and does not call the api until confirmed", () => {
    const { api } = setup();
    expect(screen.getByText(/10:00–11:00/)).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("confirming calls api.remove(id) and onDeleted", async () => {
    const { api, onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(api.remove).toHaveBeenCalledWith("b1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onDeleted).toHaveBeenCalledWith(booking);
  });

  it("cancel calls onCancel only", async () => {
    const { api, onCancel, onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("404 calls onNotFound", async () => {
    const { onNotFound, onDeleted } = setup(() => Promise.reject(new NotFoundError()));
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onNotFound).toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("network error shows a focused alert and allows retry", async () => {
    const { api, onDeleted } = setup();
    vi.mocked(api.remove).mockRejectedValueOnce(new NetworkError());
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(API_ERROR_MESSAGES.NETWORK);
    expect(alert).toHaveFocus();
    expect(onDeleted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onDeleted).toHaveBeenCalledWith(booking);
  });

  it("while deleting the button is disabled and double click sends one request", async () => {
    let resolve!: () => void;
    const { api } = setup(() => new Promise<void>((r) => { resolve = r; }));
    const btn = screen.getByRole("button", { name: "Удалить" });
    await userEvent.click(btn);
    expect(screen.getByRole("group")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /Удаление/ })).toBeDisabled();
    expect(api.remove).toHaveBeenCalledTimes(1);
    resolve();
  });

  it("unmount during delete aborts the signal and does not call callbacks", async () => {
    let resolve!: () => void;
    const { api, unmount, onDeleted } = setup(() => new Promise<void>((r) => { resolve = r; }));
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    const signal = vi.mocked(api.remove).mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    resolve();
    await Promise.resolve();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("DeleteConfirm focus and keyboard", () => {
  it("focuses «Отмена» when opened", () => {
    setup();
    expect(screen.getByRole("button", { name: "Отмена" })).toHaveFocus();
  });

  it("Esc calls onCancel and does not delete", async () => {
    const { api, onCancel, onDeleted } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });
});
