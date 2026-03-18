import fs from "node:fs";
import path from "node:path";

const DOTENV_FILE = ".env";
const COMMENT_PREFIX = "#";
const EXPORT_PREFIX = "export ";

function stripQuotes(value: string): string {
  if (value.length < 2) return value;
  const firstChar = value[0];
  const lastChar = value[value.length - 1];
  if ((firstChar === "'" && lastChar === "'") || (firstChar === '"' && lastChar === '"')) {
    return value.slice(1, -1);
  }
  return value;
}

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(COMMENT_PREFIX)) return null;
  const normalized = trimmed.startsWith(EXPORT_PREFIX) ? trimmed.slice(EXPORT_PREFIX.length) : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) return null;
  const key = normalized.slice(0, equalsIndex).trim();
  if (!key) return null;
  let value = normalized.slice(equalsIndex + 1).trim();
  value = stripQuotes(value);
  return [key, value];
}

export function loadDotEnvFile(): void {
  const envPath = path.resolve(process.cwd(), DOTENV_FILE);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = value;
  }
}
