# AGENTS Guide

This file is a lightweight starting point for contributors and automated agents.
Expand it as project conventions evolve.

## Scope

- Applies to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.
- Prefer the smallest change that solves the task.
- Preserve existing architecture, naming, and folder structure.
- Avoid touching unrelated code unless it is necessary for the requested change.

## Workflow

- Read the nearby code and documentation before editing.
- Keep changes focused and easy to review.
- Update docs when behavior, commands, or developer workflows change.
- Call out assumptions, tradeoffs, and open questions in the final handoff.

## Version Control

- Create one branch per task.
- Name branches with the repository pattern `<type>/<short-kebab-summary>`.
- Use a prefix that matches the change, such as `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`, or `test/`.
- Keep the branch suffix short, lowercase, and hyphenated, for example `feat/pipeline-executor` or `fix/ts-build-errors`.
- Create commits per logical change so each commit stays small, cohesive, and easy to review.
- Do not mix unrelated changes in the same commit.
- Write commit messages using the repository's Conventional Commits style: `<type>(<optional-scope>): <summary>`.
- Common commit types in this repo include `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`.
- Use scope when it adds clarity, for example `feat(ui): add task drawer`.

## Code Quality

- Follow the existing TypeScript, ESM, and project conventions already present in the repo.
- Avoid broad refactors unless they are explicitly requested.
- Keep code readable and add comments only when they clarify non-obvious logic.
- Never overwrite or revert user changes without explicit approval.

## Validation

- Run the smallest relevant checks for the area you changed.
- Prefer fast, deterministic, local verification steps.
- If validation is skipped or blocked, say so clearly.

## Maintenance

- Treat this file as a living document.
- Add repository-specific rules here as the team sharpens its workflow.
