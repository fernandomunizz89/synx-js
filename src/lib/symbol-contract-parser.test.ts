import { describe, expect, it, vi } from "vitest";
import { parseExportInfo, resolveImportSpecifierPath, deriveSymbolContracts } from "./symbol-contract-parser.js";

describe("lib/symbol-contract-parser", () => {
  describe("parseExportInfo", () => {
    it("identifies named and default exports", () => {
      const source = `
        export const a = 1;
        export function b() {}
        export default class C {}
        export { d, e as f };
      `;
      const info = parseExportInfo(source);
      expect(info.named).toEqual(["a", "b", "d", "e"]);
      expect(info.hasDefault).toBe(true);
    });
  });

  describe("resolveImportSpecifierPath", () => {
    it("returns candidates for relative specifiers", () => {
      const candidates = resolveImportSpecifierPath("/app/src/main.ts", "./utils");
      expect(candidates).toContain("/app/src/utils.ts");
      expect(candidates).toContain("/app/src/utils/index.ts");
    });

    it("returns empty for non-relative specifiers", () => {
      expect(resolveImportSpecifierPath("/app/src/main.ts", "lodash")).toEqual([]);
    });
  });

  describe("deriveSymbolContracts", () => {
    it("parses error messages into contracts", async () => {
      const sourceTexts = [
        'requested module "./lib/utils.js" does not provide an export named "foo" (at /app/src/main.ts:10:5)',
      ];
      const contracts = await deriveSymbolContracts({
        workspaceRoot: "/app",
        sourceTexts,
      });
      expect(contracts).toHaveLength(1);
      expect(contracts[0].symbol).toBe("foo");
      expect(contracts[0].modulePath).toBe("lib/utils.js");
    });
  });
});
