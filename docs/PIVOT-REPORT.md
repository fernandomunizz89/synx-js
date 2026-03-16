# Architect's Report: Strategic Pivot for Dream Stack 2026

As a Senior Systems Architect, I have conducted an analysis of the current orchestration infrastructure and hereby declare the "Strategic Pivot" of SINX.js. The current generic approach is giving way to a Squad of highly focused and deterministic Expert Agents based on our corporate "Dream Stack 2026" vision.

---

## STEP 1: Audit of Current Generic Orchestration

The analysis revealed 8 (+1 research) instances of generic workers, all attempting to act as "Full Cycle" according to flexible scopes, which increases static risk.

1. **Dispatcher**
   - **Original:** Rapid triage of JSON input, defining uncertainties/known facts and directing the flow.
   - **Tools:** FS read, parse struct.
2. **Spec Planner**
   - **Original:** Construction of technical planning, preparation of validation criteria and error cases. Scales to the research worker if context is missing.
   - **Tools:** FS reads/writes, `requestResearchContext` (sub-invocation).
3. **Researcher**
   - **Original:** Isolated collection engine that performs HTTP requests and internet parsing via DuckDuckGo/Tavily.
   - **Tools:** DuckDuckGo Web Search, Tavily Web Search.
4. **Feature Builder**
   - **Original:** Generator of generic code mutations. Receives massive contexts and attempts to rewrite files (`create`, `replace`, `replace_snippet`).
   - **Tools:** Interactive static reading of the workspace, Batch mutation (Workspace Edits).
5. **Bug Fixer**
   - **Original:** Similar to the Builder, but biased towards fixing problems after "Investigator" triage.
   - **Tools:** Interactive static reading, Batch mutation.
6. **Bug Investigator**
   - **Original:** Triage based on hypotheses even before sending for correction.
   - **Tools:** Initial triage/compilation via AST/Commands (`runBugTriageChecks`).
7. **QA Validator**
   - **Original:** Executor of test suites (e2e, generic regressions, syntax checks).
   - **Tools:** Deep asynchronous `exec()`, process manipulation, and hooks.
8. **Reviewer / PR Writer**
   - **Original:** Final diff validators and creators of release notes/documentation. They review without hyper-specialized context.
   - **Tools:** Diff analysis.

---

## STEP 2: "From/To" Mapping (The Pivot) 🔄

It is time to retire the centralized `builder` and agnostic figures. The redirection is based on the strict separation of the "Dream Stack 2026" architecture:

| Old Agent (Generic) | New SINX.js Specialist | Stack Focus | Test / Domain Focus |
| :--- | :--- | :--- | :--- |
| *Dispatcher + Planner + Builder* | **Sinx-Front-Expert** | Next.js (App Router), TailwindCSS | Accessibility Rendering (a11y), Storybook |
| *Dispatcher + Planner + Builder* | **Sinx-Mobile-Expert** | React Native, Expo | Native Tests, Memory Management, UI Performance |
| *Dispatcher + Planner + BugFixer*| **Sinx-Back-Expert** | Node (NestJS / Fastify), Prisma ORM | Security, Type Safety, Vitest (Integration) |
| *QA Validator + Bug Investigator* | **Sinx-QA-Engineer** | Playwright, Vitest (E2E/Unit) | Regression automation, Mutation Coverage |
| *PR Writer + Reviewer* | **(Retired in their individual form - absorbed into peer review and native QA outputs)** | - | - |

---

## STEP 3: Defining the New Specialized Squad (System Prompts)

Based on the "From/To" mapping, the pillars gain their definitive operational consciousness matrices:

### 1. Sinx-Front-Expert
**System Prompt:**
> "You are the Sinx-Front-Expert, interface architect of the Dream Stack 2026. Your exclusive specialty is Next.js (App Router) and TailwindCSS, focusing on extreme client-side performance, proper server-components, and Gold Standard accessibility (WCAG 2.1). You are reactive, dogmatic in componentization with Tailwind, and loathe global structures in favor of controlled-scope Design Tokens. You build to be tested via RTL or isolated component tools."

### 2. Sinx-Mobile-Expert
**System Prompt:**
> "You are the Sinx-Mobile-Expert. Your absolute domains are Expo and React Native. Your main focus is maximizing the use of the new React Native architecture, mitigating JS bundle bloats, optimizing UI thread transitions using Reanimated, and maintaining deep affinity with native APIs managed by Expo (EAS). When mutating or building software, your output must prioritize zero dropped frames and rational mobile memory consumption."

### 3. Sinx-Back-Expert
**System Prompt:**
> "You are the Sinx-Back-Expert, guardian of server code (Node via NestJS or Fastify) and Prisma ORM. Your code is never subject to `any`; you breathe end-to-end `Strict Type Safety`. Your responsibilities include dependency injection design, controlled validated data pipelines, and modular migrations. All implementations you propose assume a framework where Vitest is used primarily to inject agile DB Mocks."

### 4. Sinx-QA-Engineer
**System Prompt:**
> "You are the Sinx-QA-Engineer, the High-Voltage Executor and Production Arbiter of SINX.js. Your job is strictly to break the software implemented by domain experts to ensure long-term integrity. You orchestrate virtual destructive commands and contextually decide between using Playwright for full Web flows (E2E) or isolating in Vitest for unit logic. Tests are not for show; they need to validate the real mechanical integrity of Next, Expo, and Fastify."

---

## OUTPUT / CONFIGURATION: Immediate Practical Step

I suggest changing the current [/src/workers/index.ts](file:///Users/fernandomuniz/Workspace/synx-js/src/workers/index.ts) file, which currently loads `workers` in a broad list, to a "Squad Factory" format.

**Suggested change in [src/workers/index.ts](file:///Users/fernandomuniz/Workspace/synx-js/src/workers/index.ts):**

```typescript
// src/workers/index.ts

import { SinxFrontExpert } from "./experts/sinx-front-expert.js";
import { SinxMobileExpert } from "./experts/sinx-mobile-expert.js";
import { SinxBackExpert } from "./experts/sinx-back-expert.js";
import { SinxQAEngineer } from "./experts/sinx-qa-engineer.js";

// We replace the agnostic array with the Dream Stack 2026 Squad
export const workers = {
  front: new SinxFrontExpert(),
  mobile: new SinxMobileExpert(),
  back: new SinxBackExpert(),
  qa: new SinxQAEngineer(),
};

// Your `DispatcherWorker` (if kept for Initial Routing) should redirect requests 
// by validating the input stack and exclusively triggering one of these experts, delegating approval to QA.
```

This will force the ecosystem to load the specialist mapping and handle the flow by domains (`front`, [back](file:///Users/fernandomuniz/Workspace/synx-js/src/workers/builder.ts#92-122), `mobile`, [qa](file:///Users/fernandomuniz/Workspace/synx-js/src/workers/qa.ts#142-145)) at the moment of injection into the CLI or orchestrator.
