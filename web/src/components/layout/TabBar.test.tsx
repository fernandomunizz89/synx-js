import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar.js";

describe("TabBar", () => {
  it("renders all four tabs", () => {
    render(<TabBar active="tasks" onChange={vi.fn()} reviewCount={0} />);
    expect(screen.getByRole("button", { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kanban/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stream/i })).toBeInTheDocument();
  });

  it("calls onChange with the clicked tab id", async () => {
    const onChange = vi.fn();
    render(<TabBar active="tasks" onChange={onChange} reviewCount={0} />);
    await userEvent.click(screen.getByRole("button", { name: /metrics/i }));
    expect(onChange).toHaveBeenCalledWith("metrics");
  });

  it("shows the review badge on the Tasks tab when reviewCount > 0", () => {
    render(<TabBar active="tasks" onChange={vi.fn()} reviewCount={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
