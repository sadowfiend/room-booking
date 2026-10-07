// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

const NAMES = ["Предыдущий день", "Сегодня", "Завтра", "Следующий день"];

function setup(today: string | null = "2026-10-07", value = "2026-10-09") {
  const onChange = vi.fn();
  const utils = render(<DatePicker value={value} onChange={onChange} today={today} />);
  return { onChange, ...utils };
}

describe("DatePicker", () => {
  it("has the four date buttons and none is named «Дата»", () => {
    setup();
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Дата" })).toBeNull();
  });

  it("has exactly one control labelled «Дата»: input[type=date]", () => {
    setup();
    const input = screen.getByLabelText("Дата", { exact: true });
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "date");
    expect(screen.getAllByLabelText("Дата", { exact: true })).toHaveLength(1);
  });

  it("is not a list", () => {
    const { container } = setup();
    expect(screen.queryByRole("list")).toBeNull();
    expect(container.querySelector("ul, ol")).toBeNull();
  });

  it("disables all four buttons while today is null, input stays usable", () => {
    const { onChange } = setup(null);
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByLabelText("Дата")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("enables buttons when today is known", () => {
    setup();
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("«Предыдущий день» / «Следующий день» are relative to the current value", () => {
    const { onChange } = setup("2026-10-07", "2026-10-31");
    fireEvent.click(screen.getByRole("button", { name: "Предыдущий день" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-30");
    fireEvent.click(screen.getByRole("button", { name: "Следующий день" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-01");
  });

  it("«Сегодня» gives today and «Завтра» gives today + 1, regardless of value", () => {
    const { onChange } = setup("2026-12-31", "2026-10-09");
    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-12-31");
    fireEvent.click(screen.getByRole("button", { name: "Завтра" }));
    expect(onChange).toHaveBeenLastCalledWith("2027-01-01");
  });
});
