// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevConflictToggle } from "./DevConflictToggle";

const LABEL = "Инструмент разработчика: принудительный конфликт";

afterEach(() => vi.unstubAllEnvs());

describe("DevConflictToggle", () => {
  it("is hidden without NEXT_PUBLIC_DEV_TOOLS", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "");
    render(<DevConflictToggle checked={false} onChange={() => {}} />);
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it("is hidden for values other than 1", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "0");
    render(<DevConflictToggle checked={false} onChange={() => {}} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("is visible with NEXT_PUBLIC_DEV_TOOLS=1 and reports changes", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "1");
    const onChange = vi.fn();
    render(<DevConflictToggle checked={false} onChange={onChange} />);
    const box = screen.getByLabelText(LABEL);
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects checked and disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_TOOLS", "1");
    render(<DevConflictToggle checked disabled onChange={() => {}} />);
    expect(screen.getByLabelText(LABEL)).toBeChecked();
    expect(screen.getByLabelText(LABEL)).toBeDisabled();
  });
});
