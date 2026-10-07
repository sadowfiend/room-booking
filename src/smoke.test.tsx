// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("renders in jsdom with jest-dom matchers", () => {
  render(<button type="button">ok</button>);
  expect(screen.getByRole("button", { name: "ok" })).toBeInTheDocument();
});
