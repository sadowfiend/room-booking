// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/domain/booking/types";
import type { BookingsApi } from "@/lib/api/bookings";
import { NetworkError } from "@/lib/api/errors";
import { BookingPage } from "./BookingPage";

// 2026-10-07T05:30Z = 11:30 in Asia/Bishkek
const NOW = new Date("2026-10-07T05:30:00Z");
const TODAY = "2026-10-07";

const bk = (id: string, start: string, end: string, title: string): Booking => ({
  id, date: TODAY, start, end, title,
});

function makeApi(impl: BookingsApi["list"]) {
  const api: BookingsApi = { list: vi.fn(impl), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
  return api;
}

const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const busy = () => Array.from(document.querySelectorAll('[aria-busy="true"]'));

describe("design stage 1: skeleton", () => {
  it("while loading the skeleton is the only aria-busy element and is motion-safe gated", async () => {
    let resolve!: (v: Booking[]) => void;
    render(<BookingPage api={makeApi(() => new Promise((r) => { resolve = r; }))} />);
    await flush();
    const els = busy();
    expect(els).toHaveLength(1);
    const animated = els[0].querySelectorAll("[class*='animate-pulse']");
    expect(animated.length).toBeGreaterThan(0);
    for (const el of Array.from(animated)) {
      const tokens = el.className.split(/\s+/);
      expect(tokens).toContain("motion-safe:animate-pulse");
      expect(tokens).not.toContain("animate-pulse");
    }
    await act(async () => resolve([bk("1", "14:00", "15:00", "X")]));
    expect(busy()).toHaveLength(0);
  });

  it("after load of an empty list no aria-busy remains", async () => {
    render(<BookingPage api={makeApi(async () => [])} />);
    await flush();
    expect(busy()).toHaveLength(0);
  });
});

describe("design stage 1: empty state", () => {
  it("has decorative inline SVG without role and text in its own element, no lists", async () => {
    const { container } = render(<BookingPage api={makeApi(async () => [])} />);
    await flush();
    const text = screen.getByText("На эту дату бронирований нет");
    expect(text.children).toHaveLength(0);
    expect(text.textContent).toBe("На эту дату бронирований нет");
    const svg = text.parentElement?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg?.closest("[aria-hidden='true']")).toBe(svg);
    expect(screen.queryAllByRole("list")).toHaveLength(0);
    expect(container.querySelector("ul,ol,[role='list']")).toBeNull();
  });
});

describe("design stage 1: list cards and accessible names", () => {
  const bookings = [
    bk("3", "14:00", "15:00", "Future"),
    bk("1", "09:00", "10:00", "Past"),
    bk("2", "11:00", "12:00", "Ongoing"),
  ];

  async function renderList() {
    const view = render(<BookingPage api={makeApi(async () => bookings)} />);
    await flush();
    return view;
  }

  it("date field is labelled exactly «Дата» and is input[type=date]", async () => {
    await renderList();
    const field = screen.getByLabelText("Дата");
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("type", "date");
  });

  it("icons do not change button names (exact names)", async () => {
    await renderList();
    expect(screen.getByRole("button", { name: "Изменить бронь 11:00–12:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить бронь 11:00–12:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Изменить бронь 14:00–15:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Новая бронь" })).toBeInTheDocument();
    // finished booking has no actions
    expect(screen.queryByRole("button", { name: /бронь 09:00–10:00/ })).toBeNull();
  });

  it("all icons are decorative inline SVG", async () => {
    const { container } = await renderList();
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of Array.from(svgs)) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).not.toHaveAttribute("role");
    }
  });

  it("titles and badges appear exactly once per booking", async () => {
    const { container } = await renderList();
    for (const t of ["Future", "Past", "Ongoing"]) {
      expect(screen.getAllByText(t)).toHaveLength(1);
      expect(container.querySelectorAll(`[title="${t}"]`)).toHaveLength(0);
    }
    expect(screen.getAllByText("прошла")).toHaveLength(1);
    expect(screen.getAllByText("идёт")).toHaveLength(1);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("one unique labelled list with items sorted by start", async () => {
    await renderList();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveAttribute("aria-label", "Бронирования на выбранную дату");
    const items = within(lists[0]).getAllByRole("listitem");
    expect(items.map((li) => /Past|Ongoing|Future/.exec(li.textContent ?? "")?.[0])).toEqual([
      "Past", "Ongoing", "Future",
    ]);
  });

  it("no live regions while idle", async () => {
    await renderList();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });
});

describe("design stage 1: form and confirm roles", () => {
  const bookings = [bk("2", "12:00", "13:00", "Standup")];
  async function renderPage() {
    render(<BookingPage api={makeApi(async () => bookings)} />);
    await flush();
  }

  it("create form: role=form with aria-label, labelled fields, no dialog anywhere", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Новая бронь" }));
    await flush();
    const form = screen.getByRole("form", { name: "Новая бронь" });
    expect(form).toHaveAttribute("aria-label");
    expect(within(form).getByLabelText("Начало")).toBeInTheDocument();
    expect(within(form).getByLabelText("Окончание")).toBeInTheDocument();
    expect(within(form).getByLabelText("Название (необязательно)")).toBeInTheDocument();
    for (const name of ["Забронировать", "Отмена"]) {
      expect(within(form).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.querySelector("dialog,[role='dialog'],[role='alertdialog'],[aria-modal]")).toBeNull();
  });

  it("selects start with «Выберите время» first and disabled unavailable options", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Новая бронь" }));
    await flush();
    const start = screen.getByLabelText("Начало") as HTMLSelectElement;
    expect(start.options[0].textContent).toBe("Выберите время");
    const past = Array.from(start.options).find((o) => o.value === "09:00");
    expect(past?.textContent).toBe("09:00 — прошло");
    expect(past?.disabled).toBe(true);
    const taken = Array.from(start.options).find((o) => o.value === "12:00");
    expect(taken?.textContent).toBe("12:00 — занято");
    expect(taken?.disabled).toBe(true);
  });

  it("edit form: role=form and «Сохранить»; no dialog", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Изменить бронь 12:00–13:00" }));
    await flush();
    const form = screen.getByRole("form");
    expect(form).toHaveAttribute("aria-label");
    expect(within(form).getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("delete confirm: role=group with the interval, buttons «Отмена» / «Удалить», no dialog", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Удалить бронь 12:00–13:00" }));
    await flush();
    const group = screen.getByRole("group");
    expect(group).toHaveTextContent("12:00–13:00");
    expect(within(group).getByRole("button", { name: "Отмена" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("error state: exactly one alert and no status, with «Повторить»", async () => {
    render(<BookingPage api={makeApi(() => Promise.reject(new NetworkError()))} />);
    await flush();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
