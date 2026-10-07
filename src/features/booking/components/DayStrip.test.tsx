// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Booking } from "@/domain/booking/types";
import { DayStrip } from "./DayStrip";

const DATE = "2026-10-07";
const bk = (id: string, start: string, end: string, title = "Секрет"): Booking => ({
  id, date: DATE, start, end, title,
});
const BOOKINGS = [bk("1", "09:00", "10:00"), bk("2", "11:00", "12:00"), bk("3", "14:00", "15:00")];

const parts = (c: HTMLElement, p: string) => c.querySelectorAll(`[data-part="${p}"]`);

describe("DayStrip", () => {
  it("is decorative: aria-hidden, no text, no title anywhere", () => {
    const { container } = render(
      <DayStrip bookings={BOOKINGS} date={DATE} now={{ date: DATE, minutes: 11 * 60 + 30 }} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe("");
    expect(container.querySelector("[title]")).toBeNull();
    expect(container.querySelector(".sr-only")).toBeNull();
    expect(container.querySelector("[role]")).toBeNull();
  });

  it("renders one booking segment per booking", () => {
    const { container, rerender } = render(<DayStrip bookings={BOOKINGS} date={DATE} now={null} />);
    expect(parts(container, "booking")).toHaveLength(3);
    rerender(<DayStrip bookings={[]} date={DATE} now={null} />);
    expect(parts(container, "booking")).toHaveLength(0);
    rerender(<DayStrip bookings={[BOOKINGS[0]]} date={DATE} now={null} />);
    expect(parts(container, "booking")).toHaveLength(1);
  });

  it("shows the «now» line when date equals now.date", () => {
    const { container } = render(
      <DayStrip bookings={[]} date={DATE} now={{ date: DATE, minutes: 11 * 60 + 30 }} />,
    );
    expect(parts(container, "now")).toHaveLength(1);
  });

  it("has no «now» line for another date (past or future)", () => {
    const now = { date: DATE, minutes: 11 * 60 + 30 };
    const a = render(<DayStrip bookings={BOOKINGS} date="2026-10-08" now={now} />);
    expect(parts(a.container, "now")).toHaveLength(0);
    expect(parts(a.container, "past")).toHaveLength(0);
    const b = render(<DayStrip bookings={BOOKINGS} date="2026-10-06" now={now} />);
    expect(parts(b.container, "now")).toHaveLength(0);
    expect(parts(b.container, "past")).toHaveLength(0);
  });

  it("has no «now» line while now is null", () => {
    const { container } = render(<DayStrip bookings={BOOKINGS} date={DATE} now={null} />);
    expect(parts(container, "now")).toHaveLength(0);
    expect(parts(container, "past")).toHaveLength(0);
  });
});
