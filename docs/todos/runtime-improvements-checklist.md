# Runtime Improvements Checklist

- [ ] 1. Consolidate duplicated text/risk helpers into shared modules and replace local copies.
- [ ] 2. Decompose `workspace-tools.ts` into focused modules with a compatibility barrel.
- [ ] 3. Ensure token/cost estimation module and provider integration are complete and documented.
- [ ] 4. Add optional streaming mode in OpenAI-compatible provider (`AI_AGENTS_PROVIDER_STREAMING`).
- [x] 5. Make stage view markdown write atomic in `WorkerBase.finishStage`.
- [x] 6. Restore immediate-cycle budget guard for fast-path polling.
- [x] 7. Simplify `provider-error-meta.ts` defaults after successful Zod parse.
- [x] 8. Harden concurrency cursor style in `start.ts` (`cursor++` pattern).
- [x] 9. Add `envRequired` and expose required env checks in doctor diagnostics.
