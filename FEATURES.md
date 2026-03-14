# Features (Initial Commit)

## CLI UX
- Interactive terminal menus (arrow keys + Enter) for setup/new/approve/fix.
- Dynamic command hints that match how the CLI was invoked.
- Human-friendly next-step guidance after key commands.

## Setup and Configuration
- Guided setup with required human reviewer name (no implicit default).
- Provider selection via menu, with model discovery when available.
- LM Studio recommended mode saves local connection in global config by default.
- Support for provider config via saved `baseUrl`/`apiKey` or environment variables.

## Readiness and Safety
- Preflight readiness checks before `start`, `new`, `status`, and `approve`.
- `start` aborts by default when setup is broken, with clear remediation.
- Optional `start --force` for advanced/manual recovery scenarios.

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
