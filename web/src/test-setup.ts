import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL does not auto-cleanup without globals mode; do it explicitly
afterEach(cleanup);

// Polyfill ResizeObserver — used by recharts, not available in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
