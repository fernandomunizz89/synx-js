import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary.js";

// Controlled throwing — toggled per test
let shouldThrow = false;
function Bomb() {
  if (shouldThrow) throw new Error("kaboom");
  return <span>safe</span>;
}

describe("ErrorBoundary", () => {
  it("catches a render error and displays the label and error message", () => {
    shouldThrow = true;
    // Suppress React's console.error for expected errors in tests
    const spy = console.error;
    console.error = () => {};
    render(
      <ErrorBoundary label="Kanban">
        <Bomb />
      </ErrorBoundary>,
    );
    console.error = spy;

    expect(screen.getByText(/Kanban crashed/)).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("Retry button resets the boundary so a recovered component renders", async () => {
    shouldThrow = true;
    const spy = console.error;
    console.error = () => {};
    render(
      <ErrorBoundary label="Tasks">
        <Bomb />
      </ErrorBoundary>,
    );
    console.error = spy;

    expect(screen.getByText(/Tasks crashed/)).toBeInTheDocument();

    // Fix the underlying problem, then click Retry
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByText("safe")).toBeInTheDocument();
    expect(screen.queryByText(/Tasks crashed/)).not.toBeInTheDocument();
  });
});
