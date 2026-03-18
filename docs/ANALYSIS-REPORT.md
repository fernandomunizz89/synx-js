# SYNX Project Analysis Report

**Date:** March 17, 2026  
**Analyzed Version:** 5.0.0  
**Tools:** TypeScript, Vitest, Commander, Zod

---

## 1. Overview

**SYNX** is a CLI orchestrator for a multi-agent AI pipeline that executes software development tasks autonomously within local repositories. The approach is **file-driven** and **stage-based**: each stage writes JSON artifacts to `.ai-agents/tasks/<task-id>/`, allowing for recovery after failures, auditing, and human review.

### 1.1 Value Proposition

| Aspect | Description |
| :--- | :--- |
| **Goal** | Orchestrate a "squad" of specialized agents that work autonomously in the repository |
| **Model** | Conditional planning: simple tasks go directly to the expert; complex tasks pass through the Spec Planner |
| **Domains** | Front (Next.js), Mobile (Expo/RN), Back (NestJS/Fastify), SEO (Core Web Vitals) |
| **Quality** | QA Engineer with Playwright (E2E) and Vitest (unit); retry loop up to 3x with failure routing back to the original expert |
| **Providers** | LM Studio (local), OpenAI-compatible endpoints, Google Generative AI, or Anthropic Claude Code |
| **Research** | On-demand Researcher (DuckDuckGo or Tavily) when confidence < 0.6 or consecutive QA failures occur |

---

## 2. Architecture

### 2.1 Routing Flow

```
Simple/clear tasks:
  Dispatcher ──────────────► Expert ──► QA Engineer ──► Human Review

Complex/ambiguous tasks:
  Dispatcher (targetExpert hint)
      │
      ▼
  Spec Planner ──► Expert ──► QA Engineer ──► Human Review

Bug tasks:
  Dispatcher ──► Bug Investigator ──► QA Engineer ──► Human Review
```

### 2.2 Technical Stack

- **Runtime:** Node.js 18+, ESM
- **Typing:** TypeScript strict mode
- **Validation:** Zod for schemas
- **CLI:** Commander
- **Testing:** Vitest with V8 coverage
- **CI:** GitHub Actions (build + test)

### 2.3 Layered Configuration

1. Internal defaults
2. Global: `~/.ai-agents/config.json`
3. Project: `<repo>/.ai-agents/config/project.json`

---

## 3. Strengths

- **Domain Specialization:** Experts focused on specific stacks (Next.js, Expo, NestJS, SEO).
- **Resilient Recovery:** Locks, orphan management, and re-queuing of interrupted tasks.
- **Path Protection:** `.ai-agents` and `.git` directories blocked from editing.
- **Optimized Cache:** Configuration, prompts, and providers with mtime-based invalidation.
- **Research Anti-loop:** Escalates to a human when the research recommendation repeats and the problem persists.
- **Rich Documentation:** `docs/` folder with `FEATURES.md`, `MANUAL.md`, and `IMPLEMENTATION-NOTES.md`.
- **Test Suite:** 54 files, 274 tests passing.

---

## 4. Points for Improvement

### 4.1 Coverage Discrepancy

The README mentions a *"Minimum 80% coverage gate"*, but `vitest.config.ts` defines low thresholds:

```ts
thresholds: {
  global: {
    branches: 15,
    functions: 20,
    lines: 20,
    statements: 20,
  },
},
```

**Impact:** The declared goal is not enforced in CI.

### 4.2 Modules without Coverage (0%)

| Module | Impact |
| :--- | :--- |
| `provider-health.ts` | `doctor` diagnostics might fail without tests |
| `start-progress.ts` | `start` UI (interactive panel) untested |
| `workspace-tools.ts` | Workspace tools not covered |
| `provider.ts` | Base provider interface untested |

### 4.3 Legacy Naming in Types

Os nomes de agentes legados foram removidos do `AgentName` (mantemos apenas os agentes ativos do Expert Squad).

### 4.4 External Researcher Dependencies

- **DuckDuckGo:** Public API, no explicit rate limit in documentation.
- **Tavily:** Requires `TAVILY_API_KEY`; setup flow is not clear in the README.

### 4.5 Large Files

Some workers have too many lines and responsibilities:

- `qa.ts` (~1500 lines)
- `builder.ts` (~1100 lines)

Maintenance and unit testing are more difficult.

### 4.6 Incomplete CI

The current workflow does not execute:

- `npm run lint`
- `npm run check` (type check)

---

## 5. Optimization Suggestions

### 5.1 Align Coverage Thresholds

- Raise thresholds to 80% (or progressive values per module).
- Alternatively, adjust the README to reflect the current 15–20%.

### 5.2 Tests for Critical Modules

- Add tests for `provider-health.ts` (doctor).
- Add tests for `workspace-tools.ts` (used by workspace-editor).
- Consider snapshot or E2E tests for `start-progress.ts`.

### 5.3 Type Cleanup

- Remove or deprecate any remaining legacy agent naming so Zod schema and workers use only active agents.
- Ensure Zod schema and workers use only active agents.

### 5.4 Researcher Documentation

- Document environment variables for Tavily (`TAVILY_API_KEY`, etc.).
- Indicate behavior when no search provider is configured.

### 5.5 Improve CI

```yaml
- name: Lint
  run: npm run lint
- name: Type check
  run: npm run check
```

### 5.6 Decomposition of Large Modules

- Extract helpers from `qa.ts` into smaller modules (e.g., `qa-runner.ts`, `qa-verdict.ts`).
- Apply a similar pattern in `builder.ts`.

### 5.7 Security and Secrets

- Add `SECURITY.md` with guidance on API keys.
- Ensure no secrets are logged (review `logging.ts` and artifacts).

### 5.8 Workspace Scan

- Consider aligning `IGNORED_DIRS` with `.gitignore` or `.cursorignore`.
- Allow configuration of protected paths via `project.json`.

---

## 6. Executive Summary

| Criterion | Evaluation |
| :--- | :--- |
| **Clarity of Purpose** | ✅ Excellent – well-structured documentation and AI context |
| **Architecture** | ✅ Solid – conditional planning, specialized squad |
| **Code Quality** | ✅ Good – strict TypeScript, Zod, extensive tests |
| **Resilience** | ✅ Good – locks, recovery, research anti-loop |
| **Test Coverage** | ⚠️ Partial – discrepancy between goal and thresholds, 0% modules |
| **CI/CD** | ⚠️ Improvable – missing lint and type check |
| **Maintainability** | ⚠️ Attention – some modules are very large |

SYNX is a mature and well-documented project with a clear architecture and robust pipeline. The suggested improvements focus on aligning expectations (coverage, CI), covering critical modules, and reducing complexity in large files.

---

## 7. Recommended Next Steps

1. **Short term:** Adjust CI (lint + check) and coverage thresholds.
2. **Medium term:** Tests for `provider-health`, `workspace-tools`, and Researcher documentation.
3. **Long term:** Refactor `qa.ts` and `builder.ts` into smaller modules.

---

*Report generated based on source code analysis, documentation, and test execution.*
