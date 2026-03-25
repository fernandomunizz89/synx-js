import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SetupPage } from "./SetupPage.js";

const {
  fetchUiConfigMock,
  discoverModelsMock,
  saveSetupMock,
} = vi.hoisted(() => ({
  fetchUiConfigMock: vi.fn(),
  discoverModelsMock: vi.fn(),
  saveSetupMock: vi.fn(),
}));

vi.mock("../api/setup.js", () => ({
  fetchUiConfig: fetchUiConfigMock,
  discoverModels: discoverModelsMock,
  saveSetup: saveSetupMock,
}));

describe("SetupPage", () => {
  beforeEach(() => {
    fetchUiConfigMock.mockReset();
    discoverModelsMock.mockReset();
    saveSetupMock.mockReset();
    fetchUiConfigMock.mockResolvedValue({
      global: {
        providers: {
          dispatcher: { type: "anthropic", model: "claude-3-7-sonnet-latest" },
          planner: { type: "anthropic", model: "claude-3-7-sonnet-latest" },
        },
        defaults: { humanReviewer: "Fernando" },
      },
      local: { humanReviewer: "Fernando" },
    });
  });

  it("shows discovery message returned by backend when provider is unreachable", async () => {
    discoverModelsMock.mockResolvedValue({
      reachable: false,
      message: "Missing Anthropic API key. Set AI_AGENTS_ANTHROPIC_API_KEY.",
      models: [],
    });

    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Missing Anthropic API key. Set AI_AGENTS_ANTHROPIC_API_KEY.").length).toBeGreaterThan(0);
    });
  });
});
