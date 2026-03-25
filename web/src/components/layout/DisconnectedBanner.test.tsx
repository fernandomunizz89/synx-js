import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisconnectedBanner } from "./DisconnectedBanner.js";

describe("DisconnectedBanner", () => {
  it("shows the reconnect countdown when reconnectIn is provided", () => {
    render(<DisconnectedBanner reconnectIn={7} onReconnect={() => {}} />);
    expect(screen.getByText(/reconnecting in 7s/i)).toBeInTheDocument();
  });

  it("calls onReconnect when Retry now is clicked", async () => {
    const onReconnect = vi.fn();
    render(<DisconnectedBanner reconnectIn={3} onReconnect={onReconnect} />);
    await userEvent.click(screen.getByRole("button", { name: /retry now/i }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
