// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Booking } from "@/domain/booking/types";
import { BookingList } from "./BookingList";

const DATE = "2026-10-07";
const b = (id: string, start: string, end: string, title?: string): Booking => ({
  id,
  date: DATE,
  start,
  end,
  title,
});
const m = (h: number, min = 0) => h * 60 + min;

function labelsOf(title: string) {
  const item = screen.getByText(title).closest("li") as HTMLElement;
  return {
    past: within(item).queryByText("прошла"),
    ongoing: within(item).queryByText("идёт"),
  };
}

describe("BookingList status labels", () => {
  const bookings = [
    b("1", "09:00", "10:00", "Past"),
    b("2", "11:00", "12:00", "Ongoing"),
    b("3", "14:00", "15:00", "Future"),
  ];

  it("today: past, ongoing, future", () => {
    render(<BookingList bookings={bookings} date={DATE} now={{ date: DATE, minutes: m(11, 30) }} />);
    expect(labelsOf("Past").past).toBeInTheDocument();
    expect(labelsOf("Ongoing").ongoing).toBeInTheDocument();
    const f = labelsOf("Future");
    expect(f.past).toBeNull();
    expect(f.ongoing).toBeNull();
  });

  it("end == now is past", () => {
    render(<BookingList bookings={[b("1", "11:00", "12:00", "X")]} date={DATE} now={{ date: DATE, minutes: m(12) }} />);
    expect(labelsOf("X").past).toBeInTheDocument();
    expect(labelsOf("X").ongoing).toBeNull();
  });

  it("one minute before end is ongoing", () => {
    render(<BookingList bookings={[b("1", "11:00", "12:00", "X")]} date={DATE} now={{ date: DATE, minutes: m(11, 59) }} />);
    expect(labelsOf("X").ongoing).toBeInTheDocument();
  });

  it("start == now is ongoing", () => {
    render(<BookingList bookings={[b("1", "11:00", "12:00", "X")]} date={DATE} now={{ date: DATE, minutes: m(11) }} />);
    expect(labelsOf("X").ongoing).toBeInTheDocument();
    expect(labelsOf("X").past).toBeNull();
  });

  it("one minute before start has no label", () => {
    render(<BookingList bookings={[b("1", "11:00", "12:00", "X")]} date={DATE} now={{ date: DATE, minutes: m(10, 59) }} />);
    expect(labelsOf("X").ongoing).toBeNull();
    expect(labelsOf("X").past).toBeNull();
  });

  it("past date: all past", () => {
    render(<BookingList bookings={bookings} date={DATE} now={{ date: "2026-10-08", minutes: 0 }} />);
    expect(screen.getAllByText("прошла")).toHaveLength(3);
    expect(screen.queryByText("идёт")).toBeNull();
  });

  it("future date: no labels", () => {
    render(<BookingList bookings={bookings} date={DATE} now={{ date: "2026-10-06", minutes: m(23) }} />);
    expect(screen.queryByText("прошла")).toBeNull();
    expect(screen.queryByText("идёт")).toBeNull();
  });

  it("now unknown: no labels", () => {
    render(<BookingList bookings={bookings} date={DATE} now={null} />);
    expect(screen.queryByText("прошла")).toBeNull();
    expect(screen.queryByText("идёт")).toBeNull();
  });

  it("renders times and sorts by start", () => {
    render(
      <BookingList
        bookings={[b("2", "14:00", "15:00", "B"), b("1", "09:00", "10:00", "A")]}
        date={DATE}
        now={null}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("A");
    expect(items[0]).toHaveTextContent("09:00");
    expect(items[0]).toHaveTextContent("10:00");
    expect(items[1]).toHaveTextContent("B");
  });
});
