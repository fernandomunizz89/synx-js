# Features (Initial Commit)

## CLI UX
- Interactive terminal menus (arrow keys + Enter) for setup/new/approve/fix.
- Dynamic command hints that match how the CLI was invoked.
- Human-friendly next-step guidance after key commands.
- Explicit task type support in `new`: `Feature`, `Bug`, `Refactor`, `Research`, `Documentation`, `Mixed`.
- Live `start` terminal indicator with spinner, elapsed time, stage-based per-task progress bars, and task counters (`--no-progress` available).
- `status` now defaults to a focused view (current task or latest completed), with `status --all` for full history.

## Setup and Configuration
- Guided setup with required human reviewer name (no implicit default).
- Provider selection via menu, with model discovery when available.
- LM Studio recommended mode saves local connection in global config by default.
- Support for provider config via saved `baseUrl`/`apiKey` or environment variables.

## Readiness and Safety
- Preflight readiness checks before `start`, `new`, `status`, and `approve`.
- `start` aborts by default when setup is broken, with clear remediation.
- Optional `start --force` for advanced/manual recovery scenarios.
- Readiness now verifies required prompt files explicitly (not just prompt directory existence).

## Recovery and Operations
- Stale lock detection by age and dead PID.
- Safe recovery for orphan `working/` files.
- Interrupted-task requeue logic when safe.
- Improved diagnostics and repair flow via doctor/fix/resume.

## Approval Flow
- Interactive selection for pending approvals.
- `approve --yes` auto-selects when only one task is pending.

## Documentation
- Updated operational docs for day-1 setup and daily usage.
- Added guidance for new machine/new user onboarding.

## Agent Execution
- Dispatcher and Spec Planner run with provider-backed structured output.
- Bug Investigator, Bug Fixer, Feature Builder, Reviewer, QA Validator, and PR Writer also run with provider-backed structured output (no mock-only downstream path).
- All stage outputs are validated with strict zod schemas before advancing.
- Stage input chaining now includes both original task input and prior stage artifacts for downstream agents.
- Bug tasks now route through `Bug Investigator -> Bug Fixer`.
- QA can send failed tasks back to the correct implementation agent (`Bug Fixer` for bugs, `Feature Builder` for non-bugs).
- Feature Builder and Bug Fixer apply real file edits in the target workspace (`create`, `replace`, `replace_snippet`, `delete`).
- Implementation stages support broader multi-file edits for related source/test/config files while keeping protected paths blocked.
- Implementation stages now include explicit unit-test update reporting when test scripts are available.
- QA Validator now captures real validation evidence (`git diff` changed files + runnable checks from package scripts, including common E2E scripts).
- OpenAI-compatible provider calls now support timeout control via `AI_AGENTS_PROVIDER_TIMEOUT_MS`.
