// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "@/domain/booking/messages";
import type { Booking, ZonedNow } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import {
  ConflictError,
  NetworkError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { BookingForm } from "./BookingForm";

const DATE = "2026-10-09";
const NOW: ZonedNow = { date: "2026-10-07", minutes: 8 * 60 };

const bk = (id: string, start: string, end: string, title?: string): Booking => ({
  id,
  date: DATE,
  start,
  end,
  title,
});

function setup(
  over: Partial<React.ComponentProps<typeof BookingForm>> = {},
  apiOver: Partial<BookingsApi> = {},
) {
  const api: BookingsApi = {
    list: vi.fn(),
    create: vi.fn(async (input) => ({ id: "new", ...input })),
    update: vi.fn(async (id, input) => ({ id, ...input })),
    remove: vi.fn(),
    ...apiOver,
  };
  const cbs = {
    reload: vi.fn(),
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    onNotFound: vi.fn(),
  };
  const user = userEvent.setup();
  const utils = render(
    <BookingForm api={api} date={DATE} existing={[]} now={NOW} {...cbs} {...over} />,
  );
  return { api, user, ...cbs, ...utils };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  start: string,
  end: string,
  title?: string,
) {
  await user.selectOptions(screen.getByLabelText("Начало"), start);
  await user.selectOptions(screen.getByLabelText("Окончание"), end);
  if (title !== undefined) await user.type(screen.getByLabelText("Название (необязательно)"), title);
}

const submitBtn = () => screen.getByRole("button", { name: "Забронировать" });

afterEach(() => vi.unstubAllEnvs());

describe("BookingForm create", () => {
  it("submits {date,start,end,title} and calls onSaved", async () => {
    const { api, user, onSaved } = setup();
    await fill(user, "10:00", "11:00", "Planning");
    await user.click(submitBtn());
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.create).mock.calls[0][0]).toEqual({
      date: DATE,
      start: "10:00",
      end: "11:00",
      title: "Planning",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new", start: "10:00" }),
      "create",
    );
  });

  it("trims the title and omits an empty one", async () => {
    const { api, user } = setup();
    await fill(user, "10:00", "11:00", "   ");
    await user.click(submitBtn());
    const input = vi.mocked(api.create).mock.calls[0][0];
    expect(input.title === undefined || input.title === "").toBe(true);
  });

  it("shows sending state: disabled button, aria-busy, «Отправка…»", async () => {
    let resolve!: (b: Booking) => void;
    const { user, api } = setup({}, {
      create: vi.fn(() => new Promise<Booking>((r) => { resolve = r; })),
    });
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    const btn = screen.getByRole("button", { name: "Отправка…" });
    expect(btn).toBeDisabled();
    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Начало")).toBeDisabled();
    resolve(bk("x", "10:00", "11:00"));
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("empty submit blocks the api call and shows the INVALID_TIME message", async () => {
    const { api, user } = setup();
    await user.click(submitBtn());
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getAllByText(VALIDATION_MESSAGES.INVALID_TIME).length).toBeGreaterThan(0);
  });

  it("too short duration is blocked locally with the TOO_SHORT message", async () => {
    const { api, user } = setup();
    fireEvent.change(screen.getByLabelText("Начало"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Окончание"), { target: { value: "10:15" } });
    await user.click(submitBtn());
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getAllByText(VALIDATION_MESSAGES.TOO_SHORT).length).toBeGreaterThan(0);
  });

  it("too long title is blocked locally", async () => {
    const { api, user } = setup();
    await user.selectOptions(screen.getByLabelText("Начало"), "10:00");
    await user.selectOptions(screen.getByLabelText("Окончание"), "11:00");
    fireEvent.change(screen.getByLabelText("Название (необязательно)"), {
      target: { value: "x".repeat(101) },
    });
    await user.click(submitBtn());
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getAllByText(VALIDATION_MESSAGES.TITLE_TOO_LONG).length).toBeGreaterThan(0);
  });

  it("cancel calls onCancel", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("BookingForm edit", () => {
  const original = bk("o1", "10:00", "11:00", "Old");

  it("prefills values, uses «Сохранить» and calls api.update(id, input)", async () => {
    const { api, user, onSaved } = setup({ original, existing: [original] });
    expect(screen.getByLabelText("Начало")).toHaveValue("10:00");
    expect(screen.getByLabelText("Окончание")).toHaveValue("11:00");
    expect(screen.getByLabelText("Название (необязательно)")).toHaveValue("Old");
    await user.selectOptions(screen.getByLabelText("Окончание"), "11:30");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.update).toHaveBeenCalledWith(
      "o1",
      { date: DATE, start: "10:00", end: "11:30", title: "Old" },
      expect.anything(),
    );
    expect(api.create).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.anything(), "edit");
  });

  it("saving unchanged values does not conflict with itself", async () => {
    const { api, user } = setup({ original, existing: [original] });
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("404 on update reloads and calls onNotFound", async () => {
    const { user, reload, onNotFound, onSaved } = setup(
      { original, existing: [original] },
      { update: vi.fn(() => Promise.reject(new NotFoundError())) },
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(reload).toHaveBeenCalled();
    expect(onNotFound).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("BookingForm server errors", () => {
  it("409 keeps the form open and values, shows focused banner, reloads", async () => {
    const conflicting = bk("c1", "10:30", "11:30", "Rival");
    const { api, user, reload, onSaved } = setup(
      {},
      { create: vi.fn(() => Promise.reject(new ConflictError([conflicting]))) },
    );
    await fill(user, "10:00", "11:00", "Mine");
    await user.click(submitBtn());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(API_ERROR_MESSAGES.CONFLICT);
    expect(alert).toHaveTextContent("10:30");
    expect(alert).toHaveTextContent("11:30");
    expect(alert).toHaveFocus();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Начало")).toHaveValue("10:00");
    expect(screen.getByLabelText("Окончание")).toHaveValue("11:00");
    expect(screen.getByLabelText("Название (необязательно)")).toHaveValue("Mine");
    expect(submitBtn()).toBeEnabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("after a 409 the user can change the time and resubmit successfully", async () => {
    const create = vi
      .fn<BookingsApi["create"]>()
      .mockRejectedValueOnce(new ConflictError([bk("c1", "10:00", "11:00")]))
      .mockImplementation(async (input) => ({ id: "n", ...input }));
    const { user, onSaved } = setup({}, { create });
    await fill(user, "10:00", "11:00", "Mine");
    await user.click(submitBtn());
    await screen.findByRole("alert");
    await user.selectOptions(screen.getByLabelText("Начало"), "12:00");
    await user.selectOptions(screen.getByLabelText("Окончание"), "13:00");
    await user.click(submitBtn());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toEqual({
      date: DATE,
      start: "12:00",
      end: "13:00",
      title: "Mine",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("409 with a refreshed existing list marks the taken slot unavailable but keeps values", async () => {
    const conflicting = bk("c1", "10:00", "11:00");
    const create = vi.fn(() => Promise.reject(new ConflictError([conflicting])));
    const { user, rerender, api, ...cbs } = setup({}, { create });
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    await screen.findByRole("alert");
    rerender(
      <BookingForm api={api} date={DATE} existing={[conflicting]} now={NOW} {...cbs} />,
    );
    expect(screen.getByLabelText("Начало")).toHaveValue("10:00");
    expect(screen.getByLabelText("Окончание")).toHaveValue("11:00");
    expect(screen.getByRole("option", { name: "10:15 — занято" })).toBeDisabled();
  });

  it("422 shows per-field messages from VALIDATION_MESSAGES and keeps input", async () => {
    const err = new ValidationError([
      { field: "title", code: "TITLE_TOO_LONG" },
      { field: "end", code: "TOO_LONG" },
    ]);
    const { user } = setup({}, { create: vi.fn(() => Promise.reject(err)) });
    await fill(user, "10:00", "11:00", "Mine");
    await user.click(submitBtn());
    expect(await screen.findByText(VALIDATION_MESSAGES.TITLE_TOO_LONG)).toBeInTheDocument();
    expect(screen.getByText(VALIDATION_MESSAGES.TOO_LONG)).toBeInTheDocument();
    expect(screen.getByLabelText("Название (необязательно)")).toHaveValue("Mine");
    expect(screen.getByLabelText("Начало")).toHaveValue("10:00");
    expect(screen.getByLabelText("Окончание")).toBeInvalid();
    expect(submitBtn()).toBeEnabled();
  });

  it("422 on start shows the start message", async () => {
    const err = new ValidationError([{ field: "start", code: "START_IN_PAST" }]);
    const { user } = setup({}, { create: vi.fn(() => Promise.reject(err)) });
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    expect(await screen.findByText(VALIDATION_MESSAGES.START_IN_PAST)).toBeInTheDocument();
    expect(screen.getByLabelText("Начало")).toBeInvalid();
  });

  it("network error shows NETWORK banner and preserves input", async () => {
    const { user, onSaved } = setup({}, { create: vi.fn(() => Promise.reject(new NetworkError())) });
    await fill(user, "10:00", "11:00", "Mine");
    await user.click(submitBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(API_ERROR_MESSAGES.NETWORK);
    expect(screen.getByLabelText("Начало")).toHaveValue("10:00");
    expect(screen.getByLabelText("Окончание")).toHaveValue("11:00");
    expect(screen.getByLabelText("Название (необязательно)")).toHaveValue("Mine");
    expect(onSaved).not.toHaveBeenCalled();
    expect(submitBtn()).toBeEnabled();
  });

  it("unmount during submit aborts the signal and causes no errors or callbacks", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (e: unknown) => void;
    let resolve!: (b: Booking) => void;
    const create = vi.fn<BookingsApi["create"]>(
      () =>
        new Promise<Booking>((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    const { user, unmount, onSaved, reload } = setup({}, { create });
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    const signal = create.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    resolve(bk("z", "10:00", "11:00"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    void reject;
    errSpy.mockRestore();
  });

  it("unmount during a failing submit does not call reload or onNotFound", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (e: unknown) => void;
    const create = vi.fn(() => new Promise<Booking>((_r, rej) => { reject = rej; }));
    const { user, unmount, reload, onNotFound } = setup({}, { create });
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    unmount();
    reject(new ConflictError([]));
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("BookingForm dev conflict toggle", () => {
  const LABEL = "Инструмент разработчика: следующее сохранение вернёт 409";

  it("is hidden without NEXT_PUBLIC_DEV_TOOLS and forceConflict is falsy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "");
    const { api, user } = setup();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    expect(vi.mocked(api.create).mock.calls[0][1]?.forceConflict).toBeFalsy();
  });

  it("passes { forceConflict: true } when toggled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "1");
    const { api, user } = setup();
    await fill(user, "10:00", "11:00");
    await user.click(screen.getByLabelText(LABEL));
    await user.click(submitBtn());
    expect(vi.mocked(api.create).mock.calls[0][1]).toEqual(
      expect.objectContaining({ forceConflict: true }),
    );
  });

  it("is not forced when the toggle is left off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "1");
    const { api, user } = setup();
    await fill(user, "10:00", "11:00");
    await user.click(submitBtn());
    expect(vi.mocked(api.create).mock.calls[0][1]?.forceConflict).toBeFalsy();
  });
});
