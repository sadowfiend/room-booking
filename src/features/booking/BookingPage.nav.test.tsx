// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { ConflictError } from "@/lib/api/errors";
import { BookingPage } from "./BookingPage";

// 2026-10-07T05:30Z = 11:30 in Asia/Bishkek
const NOW = new Date("2026-10-07T05:30:00Z");
const TODAY = "2026-10-07";

const bk = (id: string, start: string, end: string, title: string, date = TODAY): Booking => ({
  id, date, start, end, title,
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
// A real click focuses the button before firing click; emulate that so the opener is real.
const realClick = async (el: HTMLElement) => {
  el.focus();
  await click(el);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("BookingPage date shortcuts", () => {
  it("«Завтра», «Сегодня», ‹ and › change the date", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    const input = screen.getByLabelText("Дата");
    await click(screen.getByRole("button", { name: "Завтра" }));
    expect(input).toHaveValue("2026-10-08");
    await click(screen.getByRole("button", { name: "Следующий день" }));
    expect(input).toHaveValue("2026-10-09");
    await click(screen.getByRole("button", { name: "Предыдущий день" }));
    expect(input).toHaveValue("2026-10-08");
    await click(screen.getByRole("button", { name: "Сегодня" }));
    expect(input).toHaveValue(TODAY);
    expect(api.list).toHaveBeenLastCalledWith(TODAY, expect.anything());
  });

  it("«Предыдущий день» can reach a past date (new booking disabled)", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Предыдущий день" }));
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-06");
    expect(screen.getByRole("button", { name: "Новая бронь" })).toBeDisabled();
  });
});

describe("BookingPage checklist with DatePicker and DayStrip", () => {
  it("each booking title and status label occurs exactly once", async () => {
    const { api } = makeApi([
      bk("1", "09:00", "10:00", "Past"),
      bk("2", "11:00", "12:00", "Going"),
      bk("3", "14:00", "15:00", "Later"),
    ]);
    const { container } = render(<BookingPage api={api} />);
    await flush();
    for (const t of ["Past", "Going", "Later"]) expect(screen.getAllByText(t)).toHaveLength(1);
    expect(screen.getAllByText("прошла")).toHaveLength(1);
    expect(screen.getAllByText("идёт")).toHaveLength(1);
    const strip = container.querySelector('[data-part="booking"]')!.parentElement!;
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(strip.textContent).toBe("");
    expect(strip.querySelector("[title]")).toBeNull();
    expect(strip.querySelectorAll('[data-part="booking"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-part="now"]')).toHaveLength(1);
  });

  it("empty state: text present, no role=list, strip has no segments", async () => {
    const { api } = makeApi();
    const { container } = render(<BookingPage api={api} />);
    await flush();
    expect(screen.getByText("На эту дату бронирований нет")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(container.querySelectorAll('[data-part="booking"]')).toHaveLength(0);
  });

  it("single aria-busy while loading, none after; date buttons disabled until clock known are not busy", async () => {
    let resolve!: (v: Booking[]) => void;
    const { api } = makeApi();
    api.list.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(<BookingPage api={api} />);
    await flush();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    await act(async () => resolve([bk("1", "14:00", "15:00", "X")]));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("list is unique and sorted by start", async () => {
    const { api } = makeApi([bk("b", "15:00", "16:00", "B"), bk("a", "13:00", "14:00", "A")]);
    render(<BookingPage api={api} />);
    await flush();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(1);
    const items = within(lists[0]).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("A");
    expect(items[1]).toHaveTextContent("B");
  });
});

describe("BookingPage focus management", () => {
  it("after successful save focus is on «Новая бронь»", async () => {
    const { api } = makeApi();
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    pick("Начало", "14:00");
    pick("Окончание", "15:00");
    await click(screen.getByRole("button", { name: "Забронировать" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toHaveFocus();
  });

  it("after successful edit focus is on «Новая бронь»", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Изменить бронь 14:00–15:00" }));
    pick("Окончание", "15:30");
    await click(screen.getByRole("button", { name: "Сохранить" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toHaveFocus();
  });

  it("after successful delete focus is on «Новая бронь»", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" }));
    await click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.queryByRole("group", { name: "Подтверждение удаления" })).toBeNull();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toHaveFocus();
  });

  it("delete confirm: focus on «Отмена», cancel returns focus to the opener", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro"), bk("2", "16:00", "17:00", "Other")]);
    render(<BookingPage api={api} />);
    await flush();
    await realClick(screen.getByRole("button", { name: "Удалить бронь 16:00–17:00" }));
    expect(screen.getByRole("group", { name: "Подтверждение удаления" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена" })).toHaveFocus();
    await realClick(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("group", { name: "Подтверждение удаления" })).toBeNull();
    expect(screen.getByRole("button", { name: "Удалить бронь 16:00–17:00" })).toHaveFocus();
  });

  it("delete confirm: Esc closes it and returns focus to the opener", async () => {
    const { api } = makeApi([bk("1", "14:00", "15:00", "Retro")]);
    render(<BookingPage api={api} />);
    await flush();
    await realClick(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" }));
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    expect(screen.queryByRole("group", { name: "Подтверждение удаления" })).toBeNull();
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Удалить бронь 14:00–15:00" })).toHaveFocus();
  });
});

describe("BookingPage 409 highlight", () => {
  async function openConflict() {
    const rival = bk("r", "14:00", "15:00", "Rival");
    const other = bk("o", "16:00", "17:00", "Other");
    const { api, store } = makeApi([other]);
    api.create.mockImplementationOnce(async () => {
      store.push(rival);
      throw new ConflictError([rival]);
    });
    render(<BookingPage api={api} />);
    await flush();
    await click(screen.getByRole("button", { name: "Новая бронь" }));
    pick("Начало", "14:00");
    pick("Окончание", "15:00");
    await click(screen.getByRole("button", { name: "Забронировать" }));
    return { api };
  }
  const card = (title: string) => screen.getByText(title).closest("li")!;

  it("marks only conflicting cards, focuses the banner, keeps one alert and one status", async () => {
    await openConflict();
    expect(card("Rival")).toHaveAttribute("data-conflict", "true");
    expect(card("Other")).not.toHaveAttribute("data-conflict", "true");
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveFocus();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("clears the highlight when the form is closed", async () => {
    await openConflict();
    await click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(card("Rival")).not.toHaveAttribute("data-conflict", "true");
  });

  it("clears the highlight when the date changes and returns", async () => {
    await openConflict();
    await click(screen.getByRole("button", { name: "Завтра" }));
    await click(screen.getByRole("button", { name: "Сегодня" }));
    expect(screen.getByText("Rival")).toBeInTheDocument();
    expect(card("Rival")).not.toHaveAttribute("data-conflict", "true");
  });
});
