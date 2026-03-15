# V5 implementation summary

## What changed in V5
- guided `setup`
- interactive menus with arrow keys + Enter for setup/new/approve/fix
- LM Studio setup stores local connection in config by default (no per-terminal export needed)
- command preflight checks before start/new/status/approve with guided remediation
- start aborts by default when setup is broken (`--force` available)
- all downstream workers (Bug Investigator, Builder, Reviewer, QA, PR) now use real provider calls with strict schemas
- human-friendly `start`
- guided `new`
- `doctor`, `resume`, and `fix`
- automatic repo discovery
- global config + local overrides
- mandatory explicit human reviewer name in setup (no implicit default)
- stronger stale lock cleanup (age + dead PID)
- safer orphaned working file recovery
- interrupted task requeue recovery
- stricter Dispatcher and Planner prompts
- stricter Dispatcher and Planner schemas
- clearer user-facing messages

## Future-friendly design
The CLI is ready for future iterations:
- more providers
- more real agent stages
- dashboard UI
- better retry policy
- richer task routing
- Linux validation

## 2026-03-15 optimization round (QA <-> implementation loop)
### Technical changes
- Added deterministic Cypress config recovery:
  - generates `cypress.config.cjs` fallback when needed
  - rewires Cypress scripts to `--config-file cypress.config.cjs`
  - normalizes `cypress.config.ts` back to lint-safe ESM when agents produce CommonJS in `.ts`
- Added model output resilience for implementation agents:
  - malformed `replace_snippet` edits are recovered or safely dropped before schema parse
  - prevents full task failure from partial JSON edit payloads
- Improved QA signal quality:
  - Cypress diagnostics now capture config/runtime errors explicitly
  - selector preflight ignores scaffold `example/sample` specs when real specs exist
  - QA drops selector/config findings when unsupported by executed evidence
- Added deterministic timer remediation for repeated E2E failures:
  - robust rewrite of `e2e/timer.cy.ts` countdown scenario
  - runtime hook patch in `src/hooks/useTimer.ts` when timer does not advance

### Benchmark snapshot (same task title across runs)
`QA handoff quality check: Cypress selectors and config mismatch`

| Task | Date (UTC) | Status | History items | QA returns | Wall time |
| --- | --- | --- | --- | --- | --- |
| `7uma` | 2026-03-14 | waiting_human | 11 | 3 | 461.638s |
| `ufel` | 2026-03-14 | waiting_human | 11 | 3 | 723.496s |
| `pszk` | 2026-03-15 | waiting_human | 11 | 3 | 517.857s |
| `rclv` | 2026-03-15 | waiting_human | 11 | 3 | 593.167s |
| `md6t` | 2026-03-15 | waiting_human | 11 | 3 | 606.041s |
| `gd4z` | 2026-03-15 | waiting_human | 11 | 3 | 308.620s |
| `t24e` | 2026-03-15 | waiting_human | 11 | 3 | 288.774s |
| `yxfo` | 2026-03-15 | waiting_human (`pr`) | 9 | 1 | 241.735s |
| `jjxa` | 2026-03-15 | waiting_human | 11 | 3 | 455.527s |
| `4mld` | 2026-03-15 | waiting_human (`pr`) | 6 | 0 | 123.078s |

### Outcome
- Final guardrail update (`evidence-backed QA verdict`) removed hallucinated fail loops when checks are green.
- Best observed run reached PR with zero QA returns (`4mld`, history=6).
- End-to-end wall time dropped significantly versus earlier baseline runs for the same task profile.

## 2026-03-15 provider stateless + dynamic temperature
### Technical changes
- Added low-risk runtime performance optimizations:
  - in-memory cache for `loadResolvedProjectConfig()` (with mtime-based invalidation, per process cwd)
  - in-memory cache for `loadPromptFile()` (with mtime-based invalidation and prompt-root change reset)
  - optional cache disable flags: `AI_AGENTS_DISABLE_CONFIG_CACHE=1`, `AI_AGENTS_DISABLE_PROMPT_CACHE=1`
- Added engine polling controls:
  - `AI_AGENTS_POLL_INTERVAL_MS` for idle loop tuning
  - `AI_AGENTS_MAX_IMMEDIATE_CYCLES` to allow bounded immediate re-polls after processing work
  - bounded immediate cycles prevent accidental hot infinite loops
- OpenAI-compatible provider now resolves temperature dynamically per call using explicit precedence:
  - agent + task type env override
  - agent env override
  - task type env override
  - internal defaults
- Added resilient temperature parsing:
  - only numeric values in `[0, 2]` are accepted
  - invalid env values are ignored without breaking execution
- Preserved stateless call behavior and made it explicit in provider code:
  - each call sends only current `systemPrompt` + current request payload
  - no chat-history reuse between calls
- Propagated `taskType` into `ProviderRequest` and through all worker provider calls.
