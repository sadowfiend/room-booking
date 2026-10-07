// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "@/domain/booking/messages";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { BookingPage } from "./BookingPage";

// 2026-10-07T05:30Z = 11:30 in Asia/Bishkek
const NOW = new Date("2026-10-07T05:30:00Z");
const TODAY = "2026-10-07";

const bk = (id: string, start: string, end: string, title: string, date = TODAY): Booking => ({
  id,
  date,
  start,
  end,
  title,
});

function makeApi(initial: Booking[] = []) {
  const store = [...initial];
  const api = {
    list: vi.fn(async (date: string) => store.filter((b) => b.date === date)),
    create: vi.fn(async (input: Omit<Booking, "id">) => {
      const b = { id: `n${store.length}`, ...input };
      store.push(b);
      return b;
    }),
    update: vi.fn(async (id: string, input: Omit<Booking, "id">) => {
      const i = store.findIndex((b) => b.id === id);
      store[i] = { id, ...input };
      return store[i];
    }),
    remove: vi.fn(async (id: string) => {
      store.splice(store.findIndex((b) => b.id === id), 1);
    }),
  } satisfies BookingsApi;
  return { api, store };
}

const flush = () => act(async () => {});
const click = async (el: HTMLElement) => {
  fireEvent.click(el);
  await flush();
};
const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("BookingPage past date and actions", () => {
  it("past date: «Новая бронь» is disabled and PAST_DATE text is shown", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-06" } });
    await flush();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toBeDisabled();
    expect(screen.getByText(VALIDATION_MESSAGES.PAST_DATE)).toBeInTheDocument();
  });

  it("past date: no edit/delete buttons on bookings", async () => {
    const { api } = makeApi([bk("p", "10:00", "11:00", "Old", "2026-10-06")]);
    render(<BookingPage api={api} />);
    await flush();
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-06" } });
    await flush();
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Изменить бронь/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Удалить бронь/ })).toBeNull();
  });

  it("finished booking has no actions; ongoing and future do", async () => {
    const { api } = makeApi([
      bk("1", "09:00", "10:00", "Done"),
      bk("2", "11:00", "12:00", "Going"),
      bk("3", "14:00", "15:00", "Later"),
    ]);
    render(<BookingPage api={api} />);
    await flush();
    for (const verb of ["Изменить", "Удалить"]) {
      expect(screen.queryByRole("button", { name: `${verb} бронь 09:00–10:00` })).toBeNull();
      expect(screen.getByRole("button", { name: `${verb} бронь 11:00–12:00` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `${verb} бронь 14:00–15:00` })).toBeInTheDocument();
    }
  });

  it("booking ending exactly at now has no actions", async () => {
    const { api } = makeApi([bk("1", "10:30", "11:30", "Edge")]);
    render(<BookingPage api={api} />);
    await flush();
    expect(screen.queryByRole("button", { name: /Изменить бронь/ })).toBeNull();
  });
});

describe("BookingPage create / edit / delete flows", () => {
  it("create end-to-end: status «Бронь создана», form closed, list reloaded", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    pick("Начало", "14:00");
    pick("Окончание", "15:00");
    fireEvent.change(screen.getByLabelText("Название (необязательно)"), { target: { value: "Demo" } });
    await click(screen.getByRole("button", { name: "Забронировать" }));

    expect(api.create).toHaveBeenCalledWith(
      { date: TODAY, start: "14:00", end: "15:00", title: "Demo" },
      expect.anything(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Бронь создана");
    expect(screen.queryByLabelText("Начало")).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("today's past start times are not selectable in the form", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    const start = within(screen.getByLabelText("Начало"));
    expect(start.getByRole("option", { name: "11:15 — прошло" })).toBeDisabled();
    expect(start.getByRole("option", { name: "11:30" })).toBeEnabled();
  });

  it("cancel closes the form without calling the api", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    await click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByLabelText("Начало")).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toBeInTheDocument();
  });

  it("409 at page level keeps the form open with input and shows the rival in the list", async () => {
    const { api, store } = makeApi();
    const rival = bk("r", "14:00", "15:00", "Rival");
    api.create.mockImplementationOnce(async () => {
      store.push(rival);
      throw new ConflictError([rival]);
    });
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    pick("Начало", "14:00");
    pick("Окончание", "15:00");
    fireEvent.change(screen.getByLabelText("Название (необязательно)"), { target: { value: "Mine" } });
    await click(screen.getByRole("button", { name: "Забронировать" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(API_ERROR_MESSAGES.CONFLICT);
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Начало")).toHaveValue("14:00");
    expect(screen.getByLabelText("Окончание")).toHaveValue("15:00");
    expect(screen.getByLabelText("Название (необязательно)")).toHaveValue("Mine");
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("list", { name: /Бронирования/ })).getByText("Rival")).toBeInTheDocument();
    expect(screen.queryByText("Бронь создана")).toBeNull();
    // the taken slot is now unavailable in the picker
    expect(screen.getByRole("option", { name: "14:15 — занято" })).toBeDisabled();
  });

  it("edit flow: «Бронь обновлена» and list reloaded", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Изменить бронь 14:00–15:00" }));
    expect(screen.getByLabelText("Начало")).toHaveValue("14:00");
    pick("Окончание", "15:30");
    await click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.update).toHaveBeenCalledWith(
      "1",
      { date: TODAY, start: "14:00", end: "15:30", title: "Retro" },
      expect.anything(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Бронь обновлена");
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("edit of a booking deleted elsewhere: 404 notice, form closed, list reloaded", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    api.update.mockRejectedValueOnce(new NotFoundError());
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Изменить бронь 14:00–15:00" }));
    await click(screen.getByRole("button", { name: "Сохранить" }));
    expect(screen.getByRole("alert")).toHaveTextContent(API_ERROR_MESSAGES.NOT_FOUND);
    expect(screen.getByText(API_ERROR_MESSAGES.NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByLabelText("Начало")).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("delete flow: confirm removes and shows «Бронь удалена»", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" }));
    await click(screen.getByRole("button", { name: "Удалить" }));
    expect(api.remove).toHaveBeenCalledWith("1", expect.anything());
    expect(screen.getByRole("status")).toHaveTextContent("Бронь удалена");
    expect(screen.queryByText("Retro")).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("delete cancel keeps the booking", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" }));
    await click(screen.getByRole("button", { name: "Отмена" }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText("Retro")).toBeInTheDocument();
  });

  it("delete 404: not-found notice and list reloaded", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    api.remove.mockRejectedValueOnce(new NotFoundError());
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" }));
    await click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.getByText(API_ERROR_MESSAGES.NOT_FOUND)).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
