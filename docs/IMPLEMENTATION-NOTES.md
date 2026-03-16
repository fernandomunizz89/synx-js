# SYNX – Implementation Notes

## Dream Stack 2026 – Strategic Pivot (2026-03-16)

### Decision

Replaced the generic 8-worker orchestration chain with a specialized **Expert Squad** of domain-specific agents. The goal is to reduce QA return loops by routing tasks to agents with deep domain knowledge from the start.

### New Agent Architecture

```
Dispatcher
  ├── Simple tasks     ──► Expert ──► Sinx QA Engineer ──► Human Review
  └── Complex tasks    ──► Spec Planner (targetExpert hint) ──► Expert ──► Sinx QA Engineer
```

**Expert Squad:**

| Agent | Temperature | Domain |
|---|---|---|
| `Sinx Front Expert` | 0.05 | Next.js App Router · TailwindCSS · WCAG 2.1 |
| `Sinx Mobile Expert` | 0.05 | Expo · React Native · Reanimated · EAS |
| `Sinx Back Expert` | 0.05 | NestJS/Fastify · Prisma ORM · Strict TypeScript |
| `Sinx SEO Specialist` | 0.10 | Core Web Vitals · JSON-LD · Next.js Metadata API |
| `Sinx QA Engineer` | 0.05 | Playwright E2E · Vitest unit |

### Conditional Planning

The Dispatcher now makes a binary routing decision:

- **Direct route** (simple/clear task): `nextAgent` = expert name → expert runs immediately.
- **Planning route** (complex/ambiguous): `nextAgent = "Spec Planner"` + `targetExpert = "<Expert Name>"` → Spec Planner decomposes, then routes to `targetExpert`.

The `targetExpert` hint is injected into the Spec Planner's system prompt as a `[PLANNING DIRECTIVE]`, and the `plannerOutputSchema.nextAgent` is validated against the full expert union.

### Key File Changes

| File | Change |
|---|---|
| `src/lib/types.ts` | Added 5 new expert names to `AgentName` union |
| `src/lib/constants.ts` | Stage/done file names + prompt file entries for all experts |
| `src/lib/agent-role-contract.ts` | Role contracts for all 5 experts + updated Dispatcher/Planner roles |
| `src/lib/schema.ts` | `dispatcherOutputSchema` gains `targetExpert?`; `plannerOutputSchema.nextAgent` opens to expert union; `agentNameSchema` and QA schemas widened |
| `src/lib/qa-context.ts` | `QaRemediationAgent` type includes all 4 expert names |
| `src/workers/index.ts` | Squad Factory: exports keyed `workers` object + flat `workerList` for daemon loop |
| `src/workers/dispatcher.ts` | Routing table covers all experts; LLM hint includes `targetExpert` |
| `src/workers/planner.ts` | Reads `targetExpert` from Dispatcher output; routes to correct expert via `expertStageMap` |
| `src/providers/openai-compatible-provider.ts` | `AGENT_DEFAULT_TEMPERATURES` includes all 5 experts |
| `.ai-agents/prompts/sinx-*.md` | Prompt stubs for all 5 experts |

---

## QA Loop Optimization (2026-03-15)

- Removed E2E-framework coupling from runtime (generic via project scripts + `e2e/**` discovery).
- `replace_snippet` malformed edit recovery prevents full task failure from partial JSON.
- QA drops selector/config findings unsupported by executed evidence.
- Deterministic E2E remediation guidance when value-stability assertions prove static values.

### Benchmark (same task profile across runs)

| Task | Date (UTC) | Status | History | QA returns | Wall time |
|---|---|---|---|---|---|
| `t24e` | 2026-03-15 | waiting_human | 11 | 3 | 288.774s |
| `4mld` | 2026-03-15 | waiting_human (pr) | 6 | 0 | 123.078s |

Best run reached PR with zero QA returns after the evidence-backed QA verdict guard was added.

---

## Provider Optimizations (2026-03-15)

- In-memory cache for `loadResolvedProjectConfig()` (mtime-based invalidation).
- In-memory cache for `loadPromptFile()` (mtime + prompt-root change reset).
- Provider instance reuse keyed by resolved config/env.
- Disable flags: `AI_AGENTS_DISABLE_CONFIG_CACHE=1`, `AI_AGENTS_DISABLE_PROMPT_CACHE=1`, `AI_AGENTS_DISABLE_PROVIDER_CACHE=1`.
- `AI_AGENTS_POLL_INTERVAL_MS` and `AI_AGENTS_MAX_IMMEDIATE_CYCLES` for polling control.
- Dynamic temperature resolution per agent + task type with full env-override chain.
- Stateless calls: each LLM call sends only current stage context, no chat history.

---

## V5 Foundation (2026-03-xx)

- Guided `setup` with mandatory human reviewer name.
- Interactive menus (arrow-key + Enter) for all user-facing commands.
- All workers use real provider calls with strict Zod schema validation.
- Preflight readiness checks before `start`, `new`, `status`, `approve`.
- Stale lock detection by age + dead PID; orphaned working file recovery.
- `doctor`, `resume`, `fix` for full diagnostic and repair coverage.
- Config cascade: internal defaults → global → project-local.
