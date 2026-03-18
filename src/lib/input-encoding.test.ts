import { describe, expect, it } from "vitest";
import { encodeInputJson, toonDecodeJson } from "./input-encoding.js";

describe("input-encoding", () => {
  it("minified is smaller than pretty for typical objects", () => {
    const input = {
      taskId: "abc123",
      nested: { project: "synx", flags: [true, false, true] },
      count: 42,
    };

    const pretty = encodeInputJson(input, { mode: "pretty" });
    const minified = encodeInputJson(input, { mode: "minified" });

    // Exemplo para estimativa: o mesmo cálculo vai aparecer no prompt quando a compressão estiver ativa.
    console.log("ENCODING EX1 pretty->minified", {
      prettyChars: pretty.meta.prettyChars,
      encodedChars: minified.meta.encodedChars,
      savingsChars: minified.meta.savingsChars,
      prettyTokensEstimate: pretty.meta.prettyTokensEstimate,
      encodedTokensEstimate: minified.meta.encodedTokensEstimate,
      savingsTokensEstimate: minified.meta.savingsTokensEstimate,
    });

    expect(minified.json.length).toBeLessThan(pretty.json.length);
  });

  it("toon is reversible and often smaller than pretty", () => {
    const keyA = "veryLongKeyNameThatRepeats";
    const keyB = "anotherVeryLongKeyName";

    const input = {
      [keyA]: 1,
      [keyB]: {
        [keyA]: 2,
        deep: {
          [keyA]: 3,
        },
      },
      list: [
        { [keyA]: 4, ok: true },
        { [keyA]: 5, ok: false },
      ],
    };

    const pretty = encodeInputJson(input, { mode: "pretty" });
    const toon = encodeInputJson(input, { mode: "toon" });

    console.log("ENCODING EX2 pretty->toon", {
      prettyChars: pretty.meta.prettyChars,
      encodedChars: toon.meta.encodedChars,
      savingsChars: toon.meta.savingsChars,
      prettyTokensEstimate: pretty.meta.prettyTokensEstimate,
      encodedTokensEstimate: toon.meta.encodedTokensEstimate,
      savingsTokensEstimate: toon.meta.savingsTokensEstimate,
    });

    expect(toon.json.length).toBeLessThan(pretty.json.length);

    const decoded = toonDecodeJson(JSON.parse(toon.json));
    expect(decoded).toEqual(input);
  });
});

