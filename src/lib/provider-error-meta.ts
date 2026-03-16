import { z } from "zod";

const providerErrorMetaSchema = z.object({
  parseRetries: z.number().int().nonnegative(),
  parseRetryAdditionalDurationMs: z.number().int().nonnegative(),
  parseFailureReasons: z.array(z.string()),
  providerAttempts: z.number().int().positive(),
  providerBackoffRetries: z.number().int().nonnegative(),
  providerBackoffWaitMs: z.number().int().nonnegative(),
  providerRateLimitWaitMs: z.number().int().nonnegative(),
  providerThrottleReasons: z.array(z.string()),
}).partial();

export interface ProviderErrorMeta {
  parseRetries: number;
  parseRetryAdditionalDurationMs: number;
  parseFailureReasons: string[];
  providerAttempts: number;
  providerBackoffRetries: number;
  providerBackoffWaitMs: number;
  providerRateLimitWaitMs: number;
  providerThrottleReasons: string[];
}

const DEFAULT_PROVIDER_ERROR_META: ProviderErrorMeta = {
  parseRetries: 0,
  parseRetryAdditionalDurationMs: 0,
  parseFailureReasons: [],
  providerAttempts: 1,
  providerBackoffRetries: 0,
  providerBackoffWaitMs: 0,
  providerRateLimitWaitMs: 0,
  providerThrottleReasons: [],
};

export function extractProviderErrorMeta(error: unknown): ProviderErrorMeta {
  if (!error || typeof error !== "object") return { ...DEFAULT_PROVIDER_ERROR_META };
  const parsed = providerErrorMetaSchema.safeParse(error);
  if (!parsed.success) return { ...DEFAULT_PROVIDER_ERROR_META };

  return {
    parseRetries: typeof parsed.data.parseRetries === "number" ? parsed.data.parseRetries : 0,
    parseRetryAdditionalDurationMs: typeof parsed.data.parseRetryAdditionalDurationMs === "number"
      ? parsed.data.parseRetryAdditionalDurationMs
      : 0,
    parseFailureReasons: Array.isArray(parsed.data.parseFailureReasons)
      ? parsed.data.parseFailureReasons.slice(0, 3)
      : [],
    providerAttempts: typeof parsed.data.providerAttempts === "number" ? parsed.data.providerAttempts : 1,
    providerBackoffRetries: typeof parsed.data.providerBackoffRetries === "number" ? parsed.data.providerBackoffRetries : 0,
    providerBackoffWaitMs: typeof parsed.data.providerBackoffWaitMs === "number" ? parsed.data.providerBackoffWaitMs : 0,
    providerRateLimitWaitMs: typeof parsed.data.providerRateLimitWaitMs === "number" ? parsed.data.providerRateLimitWaitMs : 0,
    providerThrottleReasons: Array.isArray(parsed.data.providerThrottleReasons)
      ? parsed.data.providerThrottleReasons.slice(0, 3)
      : [],
  };
}
