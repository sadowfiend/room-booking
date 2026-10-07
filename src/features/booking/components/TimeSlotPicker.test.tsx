// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TIME_HINT_MESSAGE } from "@/domain/booking/messages";
import type { Booking, ZonedNow } from "@/domain/booking/types";
import { TimeSlotPicker } from "./TimeSlotPicker";

const TODAY = "2026-10-07";
const FUTURE = "2026-10-09";
const m = (h: number, min = 0) => h * 60 + min;
const NOW_EARLY: ZonedNow = { date: TODAY, minutes: m(8) };

const bk = (id: string, start: string, end: string, date = FUTURE): Booking => ({
  id,
  date,
  start,
  end,
});

type Over = Partial<React.ComponentProps<typeof TimeSlotPicker>>;

function props(over: Over = {}): React.ComponentProps<typeof TimeSlotPicker> {
  return {
    date: FUTURE,
    existing: [],
    now: NOW_EARLY,
    start: "",
    end: "",
    onStartChange: vi.fn(),
    onEndChange: vi.fn(),
    ...over,
  };
}

function options(label: string) {
  const select = screen.getByLabelText(label);
  return within(select)
    .getAllByRole("option")
    .filter((o) => (o as HTMLOptionElement).value !== "") as HTMLOptionElement[];
}
const byValue = (opts: HTMLOptionElement[], v: string) => {
  const o = opts.find((x) => x.value === v);
  if (!o) throw new Error(`no option ${v}`);
  return o;
};

describe("TimeSlotPicker options", () => {
  it("has 36 options per select plus placeholder", () => {
    render(<TimeSlotPicker {...props()} />);
    expect(options("Начало")).toHaveLength(36);
    expect(options("Окончание")).toHaveLength(36);
    expect(
      within(screen.getByLabelText("Начало")).getAllByRole("option")[0],
    ).toHaveTextContent("Выберите время");
  });

  it("start has no 18:00 and end has no 09:00", () => {
    render(<TimeSlotPicker {...props()} />);
    const s = options("Начало").map((o) => o.value);
    const e = options("Окончание").map((o) => o.value);
    expect(s).toContain("09:00");
    expect(s).toContain("17:45");
    expect(s).not.toContain("18:00");
    expect(e).not.toContain("09:00");
    expect(e).toContain("09:15");
    expect(e).toContain("18:00");
  });

  it("future date with no bookings: every start is enabled", () => {
    render(<TimeSlotPicker {...props()} />);
    expect(options("Начало").every((o) => !o.disabled)).toBe(true);
  });

  it("today: starts before now are disabled as «прошло»", () => {
    render(
      <TimeSlotPicker
        {...props({ date: TODAY, now: { date: TODAY, minutes: m(10, 5) } })}
      />,
    );
    const s = options("Начало");
    for (const t of ["09:00", "09:45", "10:00"]) {
      const o = byValue(s, t);
      expect(o).toBeDisabled();
      expect(o).toHaveTextContent(`${t} — прошло`);
    }
    expect(byValue(s, "10:15")).toBeEnabled();
  });

  it("today: start exactly at now is enabled, one step earlier is not", () => {
    render(
      <TimeSlotPicker
        {...props({ date: TODAY, now: { date: TODAY, minutes: m(10, 15) } })}
      />,
    );
    const s = options("Начало");
    expect(byValue(s, "10:15")).toBeEnabled();
    expect(byValue(s, "10:00")).toBeDisabled();
  });

  it("existing 10:00-11:00 makes 10:00..10:45 busy, 11:00 enabled, 09:45 enabled", () => {
    render(
      <TimeSlotPicker {...props({ existing: [bk("a", "10:00", "11:00")] })} />,
    );
    const s = options("Начало");
    for (const t of ["10:00", "10:15", "10:30", "10:45"]) {
      expect(byValue(s, t)).toBeDisabled();
      expect(byValue(s, t)).toHaveTextContent(`${t} — занято`);
    }
    expect(byValue(s, "11:00")).toBeEnabled();
    expect(byValue(s, "11:00")).toHaveTextContent(/^11:00$/);
    expect(byValue(s, "09:45")).toBeEnabled();
  });

  it("in edit mode the original's own slots are not busy", () => {
    const original = bk("a", "10:00", "11:00");
    render(
      <TimeSlotPicker
        {...props({ existing: [original], original, start: "10:00", end: "11:00" })}
      />,
    );
    const s = options("Начало");
    for (const t of ["10:00", "10:15", "10:30", "10:45"]) {
      expect(byValue(s, t)).toBeEnabled();
    }
    const e = options("Окончание");
    expect(byValue(e, "10:30")).toBeEnabled();
    expect(byValue(e, "11:00")).toBeEnabled();
  });

  it("another booking is still busy in edit mode", () => {
    const original = bk("a", "10:00", "11:00");
    render(
      <TimeSlotPicker
        {...props({
          existing: [original, bk("b", "13:00", "14:00")],
          original,
        })}
      />,
    );
    expect(byValue(options("Начало"), "13:00")).toBeDisabled();
  });
});

describe("TimeSlotPicker end options", () => {
  it("start 10:00, no bookings: <10:30 disabled, 10:30..12:00 enabled, >12:00 disabled", () => {
    render(<TimeSlotPicker {...props({ start: "10:00" })} />);
    const e = options("Окончание");
    for (const t of ["09:15", "10:00", "10:15"]) {
      expect(byValue(e, t)).toBeDisabled();
    }
    expect(byValue(e, "10:15")).toHaveTextContent("10:15 — слишком коротко");
    for (const t of ["10:30", "10:45", "11:00", "11:45", "12:00"]) {
      expect(byValue(e, t)).toBeEnabled();
    }
    for (const t of ["12:15", "13:00", "18:00"]) {
      expect(byValue(e, t)).toBeDisabled();
    }
    expect(byValue(e, "12:15")).toHaveTextContent("12:15 — слишком долго");
  });

  it("end before start is disabled with the «раньше начала» reason", () => {
    render(<TimeSlotPicker {...props({ start: "12:00" })} />);
    const e = options("Окончание");
    expect(byValue(e, "11:00")).toBeDisabled();
    expect(byValue(e, "11:00")).toHaveTextContent("11:00 — раньше начала");
  });

  it("end past the working day is disabled", () => {
    render(<TimeSlotPicker {...props({ start: "17:30" })} />);
    const e = options("Окончание");
    expect(byValue(e, "18:00")).toBeEnabled();
    expect(byValue(e, "17:45")).toBeDisabled();
  });

  it("end crossing a later booking is busy; touching it is enabled", () => {
    render(
      <TimeSlotPicker
        {...props({ start: "10:00", existing: [bk("a", "11:00", "12:00")] })}
      />,
    );
    const e = options("Окончание");
    expect(byValue(e, "10:30")).toBeEnabled();
    expect(byValue(e, "11:00")).toBeEnabled();
    expect(byValue(e, "11:15")).toBeDisabled();
    expect(byValue(e, "11:15")).toHaveTextContent("11:15 — занято");
    expect(byValue(e, "12:00")).toBeDisabled();
  });

  it("today: start after now keeps valid ends enabled", () => {
    render(
      <TimeSlotPicker
        {...props({
          date: TODAY,
          now: { date: TODAY, minutes: m(10, 5) },
          start: "10:15",
        })}
      />,
    );
    const e = options("Окончание");
    expect(byValue(e, "10:45")).toBeEnabled();
    expect(byValue(e, "10:30")).toBeDisabled();
    expect(byValue(e, "10:15")).toBeDisabled();
  });

  it("changing start recomputes end options", () => {
    const p = props({ start: "10:00" });
    const { rerender } = render(<TimeSlotPicker {...p} />);
    expect(byValue(options("Окончание"), "12:00")).toBeEnabled();
    expect(byValue(options("Окончание"), "14:00")).toBeDisabled();
    rerender(<TimeSlotPicker {...p} start="13:00" />);
    expect(byValue(options("Окончание"), "12:00")).toBeDisabled();
    expect(byValue(options("Окончание"), "13:30")).toBeEnabled();
    expect(byValue(options("Окончание"), "15:00")).toBeEnabled();
    expect(byValue(options("Окончание"), "15:15")).toBeDisabled();
  });

  it("without a start no end option is disabled", () => {
    render(<TimeSlotPicker {...props()} />);
    expect(options("Окончание").every((o) => !o.disabled)).toBe(true);
  });
});

describe("TimeSlotPicker a11y and callbacks", () => {
  it("both selects are described by the hint", () => {
    render(<TimeSlotPicker {...props()} />);
    const hint = screen.getByText(TIME_HINT_MESSAGE);
    for (const label of ["Начало", "Окончание"]) {
      const ids = (screen.getByLabelText(label).getAttribute("aria-describedby") ?? "").split(" ");
      expect(ids).toContain(hint.id);
    }
  });

  it("renders field errors and marks the select invalid", () => {
    render(
      <TimeSlotPicker {...props({ startError: "Ошибка начала", endError: "Ошибка конца" })} />,
    );
    expect(screen.getByText("Ошибка начала")).toBeInTheDocument();
    expect(screen.getByLabelText("Начало")).toBeInvalid();
    expect(screen.getByLabelText("Окончание")).toBeInvalid();
  });

  it("disabled disables both selects", () => {
    render(<TimeSlotPicker {...props({ disabled: true })} />);
    expect(screen.getByLabelText("Начало")).toBeDisabled();
    expect(screen.getByLabelText("Окончание")).toBeDisabled();
  });

  it("reports selected values via callbacks", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const p = props();
    render(<TimeSlotPicker {...p} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Начало"), "10:15");
    expect(p.onStartChange).toHaveBeenCalledWith("10:15");
    await userEvent.setup().selectOptions(screen.getByLabelText("Окончание"), "11:00");
    expect(p.onEndChange).toHaveBeenCalledWith("11:00");
  });
});
