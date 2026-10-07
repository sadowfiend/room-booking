// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";
import { StatusBanner } from "./StatusBanner";

describe("StatusBanner", () => {
  it("error variant is an alert with action", () => {
    const onAction = vi.fn();
    render(<StatusBanner variant="error" message="Ошибка" actionLabel="Повторить" onAction={onAction} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ошибка");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("info variant is a status without button when no action", () => {
    render(<StatusBanner variant="info" message="Инфо" />);
    expect(screen.getByRole("status")).toHaveTextContent("Инфо");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("DatePicker", () => {
  it("shows value and reports changes; ignores clearing", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-07" onChange={onChange} today={null} />);
    const input = screen.getByLabelText("Дата");
    expect(input).toHaveValue("2026-10-07");
    fireEvent.change(input, { target: { value: "2026-10-09" } });
    expect(onChange).toHaveBeenCalledWith("2026-10-09");
    onChange.mockClear();
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
