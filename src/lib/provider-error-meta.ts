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
    parseRetries: parsed.data.parseRetries ?? DEFAULT_PROVIDER_ERROR_META.parseRetries,
    parseRetryAdditionalDurationMs: parsed.data.parseRetryAdditionalDurationMs ?? DEFAULT_PROVIDER_ERROR_META.parseRetryAdditionalDurationMs,
    parseFailureReasons: (parsed.data.parseFailureReasons ?? DEFAULT_PROVIDER_ERROR_META.parseFailureReasons).slice(0, 3),
    providerAttempts: parsed.data.providerAttempts ?? DEFAULT_PROVIDER_ERROR_META.providerAttempts,
    providerBackoffRetries: parsed.data.providerBackoffRetries ?? DEFAULT_PROVIDER_ERROR_META.providerBackoffRetries,
    providerBackoffWaitMs: parsed.data.providerBackoffWaitMs ?? DEFAULT_PROVIDER_ERROR_META.providerBackoffWaitMs,
    providerRateLimitWaitMs: parsed.data.providerRateLimitWaitMs ?? DEFAULT_PROVIDER_ERROR_META.providerRateLimitWaitMs,
    providerThrottleReasons: (parsed.data.providerThrottleReasons ?? DEFAULT_PROVIDER_ERROR_META.providerThrottleReasons).slice(0, 3),
  };
}
