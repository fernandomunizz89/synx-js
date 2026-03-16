export interface EnvNumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function envBoolean(name: string, defaultValue = false): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

export function envNumber(name: string, defaultValue: number, options: EnvNumberOptions = {}): number {
  const raw = process.env[name];
  if (typeof raw !== "string" || !raw.trim()) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;

  let value = options.integer ? Math.floor(parsed) : parsed;
  if (typeof options.min === "number" && value < options.min) value = options.min;
  if (typeof options.max === "number" && value > options.max) value = options.max;
  return value;
}

export function envOptionalNumber(name: string, options: EnvNumberOptions = {}): number | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;

  let value = options.integer ? Math.floor(parsed) : parsed;
  if (typeof options.min === "number" && value < options.min) return undefined;
  if (typeof options.max === "number" && value > options.max) return undefined;
  return value;
}
