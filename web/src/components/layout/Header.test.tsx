import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header.js";

describe("Header", () => {
  it("renders title and runtime status", () => {
    render(<Header taskCount={3} runtimeStatus="running" />);
    expect(screen.getByText("SYNX")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
  });

  it("cycles theme on button click: dark → light → system", async () => {
    render(<Header taskCount={0} runtimeStatus="idle" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", "Theme: dark");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("title", "Theme: light");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("title", "Theme: system");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("title", "Theme: dark");
  });
});
