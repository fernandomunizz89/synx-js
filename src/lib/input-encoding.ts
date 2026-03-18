export type InputEncodingMode = "pretty" | "minified" | "toon";

export interface InputEncodingMeta {
  requestedMode: InputEncodingMode;
  actualMode: InputEncodingMode;
  prettyChars: number;
  encodedChars: number;
  prettyTokensEstimate: number;
  encodedTokensEstimate: number;
  savingsChars: number;
  savingsTokensEstimate: number;
}

const AVG_CHARS_PER_TOKEN = 3.8;

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / AVG_CHARS_PER_TOKEN);
}

export function resolveInputEncodingModeFromEnv(env: NodeJS.ProcessEnv = process.env): InputEncodingMode {
  const raw = String(env.AI_AGENTS_INPUT_ENCODING || "")
    .trim()
    .toLowerCase();

  if (!raw) return "pretty";
  if (raw === "pretty") return "pretty";
  if (raw === "minified" || raw === "minify" || raw === "compact") return "minified";
  if (raw === "toon") return "toon";

  return "pretty";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export interface ToonWrapperV1 {
  __toonV: 1;
  __toonKeysMap: Record<string, string>; // code => original key
  __toonData: unknown;
}

const TOON_V_KEY = "__toonV";
const TOON_KEYS_MAP_KEY = "__toonKeysMap";
const TOON_DATA_KEY = "__toonData";

function collectKeysRec(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeysRec(item, out);
    return;
  }

  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    out.add(key);
    collectKeysRec(value[key], out);
  }
}

function toonEncodeValue(value: unknown, keyToCode: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => toonEncodeValue(v, keyToCode));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(value)) {
    const code = keyToCode[key] || key; // fallback: keep as-is if something goes wrong
    out[code] = toonEncodeValue(next, keyToCode);
  }
  return out;
}

function toonDecodeValue(value: unknown, codeToKey: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => toonDecodeValue(v, codeToKey));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [code, next] of Object.entries(value)) {
    const key = codeToKey[code] || code;
    out[key] = toonDecodeValue(next, codeToKey);
  }
  return out;
}

export function toonEncodeJson(input: unknown): string {
  const keys = new Set<string>();
  collectKeysRec(input, keys);

  const sortedKeys = Array.from(keys).sort((a, b) => a.localeCompare(b));
  const keysMap: Record<string, string> = {}; // code => original key
  const keyToCode: Record<string, string> = {};

  for (let i = 0; i < sortedKeys.length; i += 1) {
    const key = sortedKeys[i];
    const code = `k${i.toString(36)}`;
    keysMap[code] = key;
    keyToCode[key] = code;
  }

  const encodedData = toonEncodeValue(input, keyToCode);
  const wrapper: ToonWrapperV1 = {
    __toonV: 1,
    __toonKeysMap: keysMap,
    __toonData: encodedData,
  };

  return JSON.stringify(wrapper);
}

export function toonDecodeJson(encoded: unknown): unknown {
  if (!isPlainObject(encoded)) return encoded;
  const wrapper = encoded as Partial<ToonWrapperV1>;

  if (wrapper.__toonV !== 1) return encoded;
  if (!isPlainObject(wrapper.__toonKeysMap)) return encoded;

  const keysMap = wrapper.__toonKeysMap as Record<string, string>;
  const codeToKey: Record<string, string> = {};
  for (const [code, key] of Object.entries(keysMap)) codeToKey[code] = key;

  return toonDecodeValue(wrapper.__toonData, codeToKey);
}

export function encodeInputJson(input: unknown, args: { mode: InputEncodingMode }): { json: string; meta: InputEncodingMeta } {
  const requestedMode = args.mode;

  const prettyJson = JSON.stringify(input, null, 2);
  const prettyChars = prettyJson.length;
  const prettyTokensEstimate = estimateTokensFromChars(prettyChars);

  if (requestedMode === "pretty") {
    const encodedChars = prettyChars;
    const encodedTokensEstimate = prettyTokensEstimate;
    return {
      json: prettyJson,
      meta: {
        requestedMode,
        actualMode: "pretty",
        prettyChars,
        encodedChars,
        prettyTokensEstimate,
        encodedTokensEstimate,
        savingsChars: 0,
        savingsTokensEstimate: 0,
      },
    };
  }

  if (requestedMode === "minified") {
    const minJson = JSON.stringify(input);
    const encodedChars = minJson.length;
    const encodedTokensEstimate = estimateTokensFromChars(encodedChars);
    return {
      json: minJson,
      meta: {
        requestedMode,
        actualMode: "minified",
        prettyChars,
        encodedChars,
        prettyTokensEstimate,
        encodedTokensEstimate,
        savingsChars: prettyChars - encodedChars,
        savingsTokensEstimate: prettyTokensEstimate - encodedTokensEstimate,
      },
    };
  }

  const toonJson = toonEncodeJson(input);
  const encodedChars = toonJson.length;
  const encodedTokensEstimate = estimateTokensFromChars(encodedChars);
  return {
    json: toonJson,
    meta: {
      requestedMode,
      actualMode: "toon",
      prettyChars,
      encodedChars,
      prettyTokensEstimate,
      encodedTokensEstimate,
      savingsChars: prettyChars - encodedChars,
      savingsTokensEstimate: prettyTokensEstimate - encodedTokensEstimate,
    },
  };
}

