# SYNX v5.0.0 - Testing Evaluation & Coverage Plan

**Generated:** 2026-03-16  
**Repository:** `ai-agents-v5-node-ts`  
**Project Name:** SYNX (Synthetic Agent Orchestrator)

---

## Executive Summary

SYNX is a **CLI orchestrator for multi-agent AI pipelines** that coordinates autonomous software development tasks (bug fixes, features, refactors) through a sequential agent workflow. The system makes real file edits, runs quality checks, and handles remediation loops.

**Current Testing Status:** ❌ **Critical Gap**
- No unit test framework configured
- No existing test files detected
- Cypress (E2E) is a dev dependency but no test specs found
- **Risk Level:** HIGH - System makes autonomous file modifications without test safety net

---

## 1. Project Structure Analysis

### 1.1 Directory Overview

```
src/
├── index.ts                 # CLI entry point (Commander setup)
├── commands/                # CLI command handlers (11 files)
│   ├── approve.ts
│   ├── cancel.ts
│   ├── doctor.ts
│   ├── fix.ts
│   ├── metrics.ts
│   ├── new.ts
│   ├── resume.ts
│   ├── setup.ts
│   ├── show-config.ts
│   ├── start.ts            # Main engine loop
│   └── status.ts
├── lib/                     # Core business logic (48 modules)
│   ├── config.ts           # Configuration loading & merging
│   ├── schema.ts           # Zod schemas (validation contracts)
│   ├── task.ts             # Task lifecycle management
│   ├── runtime.ts          # Lock management, recovery, state
│   ├── fs.ts               # File system utilities (atomic writes)
│   ├── paths.ts            # Path resolution utilities
│   ├── validation-checks.ts # Project validation (lint, test, E2E)
│   ├── quality-retry-policy.ts # Adaptive retry logic
│   ├── workspace-editor.ts # File edit application
│   ├── model-output-recovery.ts # LLM output normalization
│   ├── provider-error-meta.ts # Provider error extraction
│   ├── token-estimation.ts # Token/cost estimation
│   ├── text-utils.ts       # Text utilities
│   ├── cypress-tools.ts    # Cypress-specific utilities
│   ├── command-runner.ts   # Shell command execution
│   ├── workspace-scanner.ts # File scanning with limits
│   ├── provider-health.ts  # Provider connectivity checks
│   ├── readiness.ts        # Preflight readiness checks
│   ├── logging.ts          # Structured logging
│   ├── metrics.ts          # Metrics collection
│   └── ... (28 more modules)
├── providers/               # AI provider implementations (5 files)
│   ├── provider.ts         # Provider interface
│   ├── factory.ts          # Provider factory
│   ├── mock-provider.ts    # Mock provider for testing
│   ├── lmstudio-provider.ts # LM Studio provider
│   └── openai-compatible-provider.ts # OpenAI-compatible provider
└── workers/                 # Agent workers (10 files)
    ├── base.ts             # Worker base class
    ├── index.ts            # Worker registry
    ├── dispatcher.ts       # Dispatcher agent
    ├── planner.ts          # Spec Planner agent
    ├── bug-investigator.ts # Bug Investigator agent
    ├── bug-fixer.ts        # Bug Fixer agent
    ├── builder.ts          # Feature Builder agent
    ├── reviewer.ts         # Code Reviewer agent
    ├── qa.ts               # QA Validator agent
    └── pr-writer.ts        # PR Writer agent
```

---

## 2. Module Classification

### 2.1 Core Business Logic Modules (HIGH PRIORITY)

| Module | Purpose | Test Complexity | Dependencies |
|--------|---------|-----------------|--------------|
| `lib/schema.ts` | Zod schemas for all data contracts | Low | zod |
| `lib/config.ts` | Config loading, merging, caching | Medium | fs, paths, schema |
| `lib/task.ts` | Task CRUD, lifecycle, meta management | Medium | fs, paths, schema, utils |
| `lib/runtime.ts` | Lock management, recovery, state machine | High | fs, paths, task, constants |
| `lib/validation-checks.ts` | Project validation, test detection | High | command-runner, cypress-tools |
| `lib/quality-retry-policy.ts` | Adaptive retry logic, failure classification | Medium | text-utils |
| `lib/workspace-editor.ts` | File edit application, path safety | High | fs, env, workspace-scanner |
| `lib/model-output-recovery.ts` | LLM output normalization, edit recovery | Medium | None |
| `lib/provider-error-meta.ts` | Provider error extraction | Low | zod |
| `lib/token-estimation.ts` | Token/cost estimation | Low | env |
| `lib/cypress-tools.ts` | Cypress XML parsing, selector preflight | Medium | fs, text-utils, workspace-scanner |
| `lib/command-runner.ts` | Shell command execution with timeout | Medium | child_process |
| `lib/workspace-scanner.ts` | File scanning with limits | Medium | fs, paths |
| `lib/provider-health.ts` | Provider connectivity checks | Medium | provider factory |
| `lib/readiness.ts` | Preflight readiness checks | High | config, paths, provider-health |
| `workers/base.ts` | Worker base class, stage lifecycle | High | fs, logging, runtime, task |

### 2.2 CLI Configuration/Commands Modules (MEDIUM PRIORITY)

| Module | Purpose | Test Complexity |
|--------|---------|-----------------|
| `index.ts` | CLI entry point, command registration | Low |
| `commands/setup.ts` | Interactive setup wizard | Medium |
| `commands/start.ts` | Engine loop, recovery, progress | High |
| `commands/new.ts` | Task creation CLI | Medium |
| `commands/status.ts` | Task status display | Medium |
| `commands/approve.ts` | PR approval workflow | Medium |
| `commands/doctor.ts` | Diagnostic checks | Medium |
| `commands/resume.ts` | Task recovery | Low |
| `commands/fix.ts` | Automatic repair | Medium |
| `commands/metrics.ts` | Metrics display | Low |
| `commands/show-config.ts` | Config display | Low |
| `commands/cancel.ts` | Task cancellation | Low |

### 2.3 Utility/Helper Modules (LOW PRIORITY)

| Module | Purpose |
|--------|---------|
| `lib/fs.ts` | File system utilities (atomic writes, JSON handling) |
| `lib/paths.ts` | Path resolution (repo root, config dirs) |
| `lib/utils.ts` | General utilities (sleep, randomId, slugify, date formatting) |
| `lib/text-utils.ts` | Text utilities (unique, trim, normalize) |
| `lib/env.ts` | Environment variable parsing |
| `lib/constants.ts` | Application constants |
| `lib/types.ts` | TypeScript type definitions |
| `lib/logging.ts` | Structured logging utilities |
| `lib/metrics.ts` | Metrics collection utilities |
| `lib/human-messages.ts` | Human-readable message formatting |
| `lib/synx-ui.ts` | Terminal UI rendering |
| `lib/start-progress.ts` | Progress indicator rendering |
| `lib/interactive.ts` | Interactive prompts (@inquirer) |
| `lib/cli-command.ts` | CLI command helpers |
| `lib/repo.ts` | Repository root detection |
| `lib/bootstrap.ts` | Initialization bootstrap |
| `lib/risk.ts` | Risk assessment utilities |
| `lib/agent-role-contract.ts` | Agent role definitions |

---

## 3. Testing Framework Recommendation

### Recommended: **Vitest** ⭐

```json
{
  "devDependencies": {
    "vitest": "^1.3.0",
    "@vitest/coverage-v8": "^1.3.0"
  }
}
```

### Rationale

| Criteria | Vitest | Jest | Why Vitest Wins |
|----------|--------|------|-----------------|
| **ESM Support** | ✅ Native | ⚠️ Requires config | Project uses `"type": "module"` |
| **TypeScript** | ✅ Built-in | ⚠️ Needs ts-jest | Zero config needed |
| **Speed** | ⚡ Fast (parallel threads) | 🐢 Slower | Critical for 50%+ coverage goal |
| **Config Simplicity** | ✅ Minimal | ⚠️ Verbose | Aligns with project's clean config style |
| **Watch Mode** | ✅ Excellent | ✅ Good | Better for TDD workflow |
| **Coverage** | ✅ v8 (accurate) | ✅ Istanbul | v8 is more accurate for TypeScript |
| **Mocking** | ✅ Vitest mocks | ✅ Jest mocks | Similar API, Vitest is lighter |
| **Community** | Growing | Mature | Jest larger but Vitest gaining fast |

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/index.ts',
        'src/**/*.d.ts',
        'src/lib/types.ts',
        'src/lib/constants.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        global: {
          branches: 50,
          functions: 50,
          lines: 50,
          statements: 50,
        },
      },
    },
  },
});
```

---

## 4. Prioritized Unit Test Plan (Minimum 50% Coverage)

### Priority Legend
- 🔴 **HIGH** - Core logic, parsers, state management (test first)
- 🟡 **MEDIUM** - Commands, CLI routing, integrations (test second)
- 🟢 **LOW** - UI rendering, pure logging, constants (test last)

---

### Phase 1: HIGH PRIORITY - Core Business Logic (Target: 30% coverage)

#### 4.1.1 Schema Validation (`lib/schema.ts`) 🔴

```typescript
// src/lib/schema.test.ts
import { describe, it, expect } from 'vitest';
import { 
  taskTypeSchema, 
  taskStatusSchema, 
  agentNameSchema,
  providerStageConfigSchema,
  taskMetaSchema,
  dispatcherOutputSchema,
  plannerOutputSchema,
  builderOutputSchema,
  qaOutputSchema,
} from './schema';

describe('Schema Validation', () => {
  describe('taskTypeSchema', () => {
    it('should accept valid task types', () => {
      const validTypes = ['Feature', 'Bug', 'Refactor', 'Research', 'Documentation', 'Mixed'];
      validTypes.forEach(type => {
        expect(() => taskTypeSchema.parse(type)).not.toThrow();
      });
    });

    it('should reject invalid task types', () => {
      expect(() => taskTypeSchema.parse('InvalidType')).toThrow();
    });
  });

  describe('taskMetaSchema', () => {
    it('should parse valid task metadata', () => {
      const validMeta = {
        taskId: 'task-20260316-abc123-test',
        title: 'Add dark mode toggle',
        type: 'Feature',
        project: 'my-app',
        status: 'in_progress',
        currentStage: 'planner',
        currentAgent: 'Spec Planner',
        nextAgent: 'Feature Builder',
        humanApprovalRequired: false,
        createdAt: '2026-03-16T10:00:00.000Z',
        updatedAt: '2026-03-16T10:05:00.000Z',
        history: [],
      };
      expect(taskMetaSchema.parse(validMeta)).toEqual(validMeta);
    });

    it('should normalize empty currentAgent to empty string', () => {
      const meta = { /* ... */ currentAgent: '', /* ... */ };
      const result = taskMetaSchema.parse(meta);
      expect(result.currentAgent).toBe('');
    });
  });

  describe('builderOutputSchema', () => {
    it('should validate create action with content', () => {
      const output = {
        implementationSummary: 'Added feature',
        filesChanged: ['src/foo.ts'],
        changesMade: ['Created foo.ts'],
        testsToRun: ['npm test'],
        risks: ['None'],
        edits: [{ path: 'src/foo.ts', action: 'create', content: 'export const foo = 1;' }],
        nextAgent: 'Reviewer',
      };
      expect(builderOutputSchema.parse(output)).toEqual(output);
    });

    it('should validate replace_snippet action with find/replace', () => {
      const output = {
        /* ... */
        edits: [{ 
          path: 'src/foo.ts', 
          action: 'replace_snippet', 
          find: 'const a = 1;', 
          replace: 'const a = 2;' 
        }],
        nextAgent: 'Reviewer',
      };
      expect(builderOutputSchema.parse(output)).toEqual(output);
    });

    it('should reject replace_snippet without find', () => {
      const output = {
        /* ... */
        edits: [{ path: 'src/foo.ts', action: 'replace_snippet', replace: 'const a = 2;' }],
        nextAgent: 'Reviewer',
      };
      expect(() => builderOutputSchema.parse(output)).toThrow();
    });
  });

  describe('qaOutputSchema', () => {
    it('should parse QA output with test cases', () => {
      const output = {
        mainScenarios: ['User can toggle dark mode'],
        acceptanceChecklist: ['Toggle button exists'],
        testCases: [{
          id: 'tc-1',
          title: 'Dark mode toggle',
          type: 'functional',
          expectedResult: 'Theme changes',
          actualResult: 'Theme changed',
          status: 'pass',
        }],
        failures: [],
        verdict: 'pass',
        nextAgent: 'PR Writer',
      };
      expect(qaOutputSchema.parse(output)).toEqual(output);
    });

    it('should include qaHandoffContext on QA failure', () => {
      const output = {
        /* ... */
        verdict: 'fail',
        qaHandoffContext: {
          attempt: 1,
          maxRetries: 3,
          returnedTo: 'Feature Builder',
          summary: 'Tests failing',
          latestFindings: [{
            issue: 'Toggle not working',
            expectedResult: 'Theme changes',
            receivedResult: 'No change',
            recommendedAction: 'Fix toggle handler',
          }],
          history: [],
        },
        nextAgent: 'Feature Builder',
      };
      expect(qaOutputSchema.parse(output)).toEqual(output);
    });
  });
});
```

**Estimated Lines:** ~200  
**Coverage Impact:** Schema validation is foundational - affects all data flow

---

#### 4.1.2 Configuration Loading (`lib/config.ts`) 🔴

```typescript
// src/lib/config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadGlobalConfig, loadLocalProjectConfig, loadResolvedProjectConfig } from './config';
import { readJson } from './fs';
import { globalConfigPath } from './paths';

vi.mock('./fs', () => ({
  readJson: vi.fn(),
  readText: vi.fn(),
  statSafe: vi.fn(),
}));

vi.mock('./paths', () => ({
  globalConfigPath: vi.fn(),
  configDir: vi.fn(() => '/mock/.ai-agents/config'),
  promptsDir: vi.fn(),
}));

describe('Configuration Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear config cache between tests
    process.env.AI_AGENTS_DISABLE_CONFIG_CACHE = '1';
  });

  describe('loadGlobalConfig', () => {
    it('should load and validate global config', async () => {
      const mockConfig = {
        providers: {
          dispatcher: { type: 'openai-compatible', model: 'gpt-4o' },
          planner: { type: 'lmstudio', model: 'local-model' },
        },
        defaults: { humanReviewer: 'John Doe' },
      };
      vi.mocked(readJson).mockResolvedValue(mockConfig);
      vi.mocked(globalConfigPath).mockReturnValue('/mock/.ai-agents/config.json');

      const result = await loadGlobalConfig();
      expect(result).toEqual(mockConfig);
    });

    it('should reject invalid global config schema', async () => {
      vi.mocked(readJson).mockResolvedValue({ invalid: 'config' });
      await expect(loadGlobalConfig()).rejects.toThrow();
    });
  });

  describe('loadResolvedProjectConfig', () => {
    it('should merge global and local configs', async () => {
      const globalConfig = {
        providers: {
          dispatcher: { type: 'openai-compatible', model: 'gpt-4o', baseUrl: 'http://localhost:1234' },
          planner: { type: 'lmstudio', model: 'local-model' },
        },
        defaults: { humanReviewer: 'Default Reviewer' },
      };
      const localConfig = {
        projectName: 'Test Project',
        language: 'TypeScript',
        framework: 'React',
        humanReviewer: 'Custom Reviewer',
        tasksDir: '.ai-agents/tasks',
      };

      vi.mocked(readJson)
        .mockResolvedValueOnce(globalConfig)
        .mockResolvedValueOnce(localConfig);

      const result = await loadResolvedProjectConfig();
      expect(result.projectName).toBe('Test Project');
      expect(result.humanReviewer).toBe('Custom Reviewer');
      expect(result.providers.dispatcher.model).toBe('gpt-4o');
    });

    it('should apply provider overrides from local config', async () => {
      const globalConfig = {
        providers: {
          dispatcher: { type: 'openai-compatible', model: 'gpt-4o' },
          planner: { type: 'lmstudio', model: 'local-model' },
        },
        defaults: { humanReviewer: 'Default' },
      };
      const localConfig = {
        projectName: 'Test',
        language: 'TS',
        framework: 'React',
        humanReviewer: 'Custom',
        tasksDir: '.ai-agents/tasks',
        providerOverrides: {
          dispatcher: { model: 'gpt-4o-mini' },
        },
      };

      vi.mocked(readJson)
        .mockResolvedValueOnce(globalConfig)
        .mockResolvedValueOnce(localConfig);

      const result = await loadResolvedProjectConfig();
      expect(result.providers.dispatcher.model).toBe('gpt-4o-mini');
    });
  });
});
```

**Estimated Lines:** ~150  
**Coverage Impact:** Config is loaded on every command - critical path

---

#### 4.1.3 Task Management (`lib/task.ts`) 🔴

```typescript
// src/lib/task.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createTask, 
  loadTaskMeta, 
  saveTaskMeta, 
  ensureTaskStructure,
  finalizeForHumanReview,
} from './task';
import { ensureDir, writeJson, writeText, readJsonValidated } from './fs';
import { taskDir, tasksDir } from './paths';

vi.mock('./fs', () => ({
  ensureDir: vi.fn(),
  writeJson: vi.fn(),
  writeText: vi.fn(),
  readJsonValidated: vi.fn(),
  exists: vi.fn(),
  listDirectories: vi.fn(),
}));

vi.mock('./paths', () => ({
  taskDir: vi.fn((taskId) => `/mock/tasks/${taskId}`),
  tasksDir: vi.fn(() => '/mock/tasks'),
}));

describe('Task Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create task with correct structure', async () => {
      const input = {
        title: 'Add dark mode',
        typeHint: 'Feature' as const,
        project: 'my-app',
        rawRequest: 'Implement dark mode toggle',
        extraContext: {
          relatedFiles: ['src/App.tsx'],
          logs: [],
          notes: [],
        },
      };

      const result = await createTask(input);
      
      expect(result.taskId).toMatch(/^task-\d{8}-\w{4}-add-dark-mode$/);
      expect(result.taskPath).toBe(`/mock/tasks/${result.taskId}`);
      expect(ensureDir).toHaveBeenCalledTimes(9); // 9 subdirs
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining('meta.json'),
        expect.objectContaining({
          taskId: result.taskId,
          title: 'Add dark mode',
          type: 'Feature',
          status: 'new',
          nextAgent: 'Dispatcher',
        }),
      );
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining('new-task.json'),
        input,
      );
    });

    it('should create inbox request for dispatcher', async () => {
      const input = { /* ... */ };
      const result = await createTask(input);
      
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining('00-dispatcher.request.json'),
        expect.objectContaining({
          taskId: result.taskId,
          stage: 'dispatcher',
          status: 'request',
          agent: 'Dispatcher',
          inputRef: 'input/new-task.json',
        }),
      );
    });
  });

  describe('finalizeForHumanReview', () => {
    it('should create human review request', async () => {
      await finalizeForHumanReview('task-123');
      
      expect(writeJson).toHaveBeenCalledWith(
        expect.stringContaining('90-final-review.request.json'),
        expect.objectContaining({
          taskId: 'task-123',
          stage: 'human-review',
          status: 'request',
          agent: 'Human Review',
          inputRef: 'done/07-pr.json',
        }),
      );
    });
  });
});
```

**Estimated Lines:** ~120  
**Coverage Impact:** Task lifecycle is core to orchestration

---

#### 4.1.4 Runtime & Lock Management (`lib/runtime.ts`) 🔴

```typescript
// src/lib/runtime.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  acquireLock, 
  releaseLock, 
  detectStaleLocks, 
  clearStaleLocks,
  processIsRunning,
  recoverWorkingFiles,
  detectInterruptedTasks,
} from './runtime';
import { exists, readJson, statSafe, listFiles, listDirectories } from './fs';
import { locksDir, tasksDir } from './paths';
import { loadTaskMeta, saveTaskMeta } from './task';

vi.mock('./fs');
vi.mock('./paths');
vi.mock('./task');

describe('Runtime & Lock Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processIsRunning', () => {
    it('should return true for running process', () => {
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
      expect(processIsRunning(12345)).toBe(true);
      killSpy.mockRestore();
    });

    it('should return false for non-existent PID', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });
      expect(processIsRunning(99999)).toBe(false);
      killSpy.mockRestore();
    });

    it('should return false for invalid PID', () => {
      expect(processIsRunning(0)).toBe(false);
      expect(processIsRunning(-1)).toBe(false);
      expect(processIsRunning(NaN as any)).toBe(false);
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully', async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const writeFileSpy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(require('fs').promises.writeFile).mockImplementation(writeFileSpy);

      const result = await acquireLock('task-123-00-dispatcher.request.json.lock');
      
      expect(result).toBe(true);
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('task-123-00-dispatcher.request.json.lock'),
        expect.stringContaining('"pid"'),
        expect.objectContaining({ flag: 'wx' }),
      );
    });

    it('should return false if lock already exists', async () => {
      vi.mocked(require('fs').promises.writeFile).mockRejectedValue({ code: 'EEXIST' });
      const result = await acquireLock('existing.lock');
      expect(result).toBe(false);
    });
  });

  describe('detectStaleLocks', () => {
    it('should detect lock older than threshold', async () => {
      vi.mocked(locksDir).mockReturnValue('/mock/locks');
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(listFiles).mockResolvedValue(['stale.lock']);
      vi.mocked(statSafe).mockResolvedValue({ mtimeMs: Date.now() - 60 * 60 * 1000 }); // 1 hour ago
      vi.mocked(readJson).mockResolvedValue({ pid: 12345, createdAt: new Date().toISOString() });
      vi.mocked(require('fs').promises.readFile).mockResolvedValue(JSON.stringify({ pid: 12345 }));

      // Mock processIsRunning to return false (dead PID)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const result = await detectStaleLocks();
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].reason).toContain('not running');
      
      killSpy.mockRestore();
    });
  });

  describe('recoverWorkingFiles', () => {
    it('should requeue working file to inbox', async () => {
      vi.mocked(tasksDir).mockReturnValue('/mock/tasks');
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(listDirectories).mockResolvedValue(['task-123']);
      vi.mocked(listFiles).mockImplementation((dir) => {
        if (dir.includes('working')) return Promise.resolve(['00-dispatcher.working.json']);
        if (dir.includes('inbox')) return Promise.resolve([]);
        return Promise.resolve([]);
      });
      vi.mocked(require('fs').promises.rename).mockResolvedValue();

      const result = await recoverWorkingFiles();
      
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('requeued');
      expect(require('fs').promises.rename).toHaveBeenCalledWith(
        expect.stringContaining('working/00-dispatcher.working.json'),
        expect.stringContaining('inbox/00-dispatcher.request.json'),
      );
    });

    it('should move duplicate to failed', async () => {
      vi.mocked(tasksDir).mockReturnValue('/mock/tasks');
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(listDirectories).mockResolvedValue(['task-123']);
      vi.mocked(listFiles).mockImplementation((dir) => {
        if (dir.includes('working')) return Promise.resolve(['00-dispatcher.working.json']);
        if (dir.includes('inbox')) return Promise.resolve(['00-dispatcher.request.json']);
        return Promise.resolve([]);
      });

      const result = await recoverWorkingFiles();
      
      expect(result[0].action).toBe('moved_to_failed');
      expect(result[0].reason).toContain('duplicate');
    });
  });
});
```

**Estimated Lines:** ~200  
**Coverage Impact:** Lock management prevents race conditions - critical for reliability

---

#### 4.1.5 Workspace Editor (`lib/workspace-editor.ts`) 🔴

```typescript
// src/lib/workspace-editor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyWorkspaceEdits, resolveWorkspacePath } from './workspace-editor';
import { exists, ensureDir } from './fs';
import { promises as fs } from 'node:fs';

vi.mock('./fs');
vi.mock('node:fs');

describe('Workspace Editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_AGENTS_DRY_RUN = '0';
  });

  describe('resolveWorkspacePath', () => {
    it('should resolve relative path within workspace', () => {
      const result = resolveWorkspacePath('/workspace', 'src/foo.ts');
      expect(result.absolutePath).toBe('/workspace/src/foo.ts');
      expect(result.relativePath).toBe('src/foo.ts');
    });

    it('should reject path escaping workspace', () => {
      expect(() => resolveWorkspacePath('/workspace', '../escape.ts')).toThrow('escapes workspace');
    });

    it('should reject blocked paths', () => {
      expect(() => resolveWorkspacePath('/workspace', '.git/config')).toThrow('protected');
      expect(() => resolveWorkspacePath('/workspace', 'node_modules/foo')).toThrow('protected');
    });
  });

  describe('applyWorkspaceEdits', () => {
    it('should apply create edit', async () => {
      vi.mocked(exists).mockResolvedValue(false);
      vi.mocked(ensureDir).mockResolvedValue();
      vi.mocked(fs.writeFile).mockResolvedValue();

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'create', content: 'export const foo = 1;' }],
      });

      expect(result.appliedFiles).toContain('src/foo.ts');
      expect(result.changedFiles).toContain('src/foo.ts');
      expect(result.skippedEdits).toHaveLength(0);
    });

    it('should apply replace edit', async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('old content');
      vi.mocked(fs.writeFile).mockResolvedValue();

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'replace', content: 'new content' }],
      });

      expect(result.changedFiles).toContain('src/foo.ts');
    });

    it('should skip replace if content unchanged', async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('same content');

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'replace', content: 'same content' }],
      });

      expect(result.skippedEdits).toContainEqual(
        expect.stringContaining('content unchanged'),
      );
    });

    it('should apply replace_snippet edit', async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('const a = 1;\nconst b = 2;');
      vi.mocked(fs.writeFile).mockResolvedValue();

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ 
          path: 'src/foo.ts', 
          action: 'replace_snippet', 
          find: 'const a = 1;', 
          replace: 'const a = 3;' 
        }],
      });

      expect(result.changedFiles).toContain('src/foo.ts');
    });

    it('should skip replace_snippet if find not found', async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('const a = 1;');

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ 
          path: 'src/foo.ts', 
          action: 'replace_snippet', 
          find: 'const b = 2;', 
          replace: 'const b = 3;' 
        }],
      });

      expect(result.skippedEdits).toContainEqual(
        expect.stringContaining('target snippet not found'),
      );
    });

    it('should apply delete edit', async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(fs.unlink).mockResolvedValue();

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'delete' }],
      });

      expect(result.changedFiles).toContain('src/foo.ts');
    });

    it('should skip delete if file does not exist', async () => {
      vi.mocked(exists).mockResolvedValue(false);

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'delete' }],
      });

      expect(result.skippedEdits).toContainEqual(
        expect.stringContaining('file does not exist'),
      );
    });

    it('should respect dry-run mode', async () => {
      process.env.AI_AGENTS_DRY_RUN = '1';
      vi.mocked(exists).mockResolvedValue(false);

      const result = await applyWorkspaceEdits({
        workspaceRoot: '/workspace',
        edits: [{ path: 'src/foo.ts', action: 'create', content: 'test' }],
      });

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dry-run mode'),
      );
    });
  });
});
```

**Estimated Lines:** ~180  
**Coverage Impact:** File edits are the primary action - must be bulletproof

---

#### 4.1.6 Quality Retry Policy (`lib/quality-retry-policy.ts`) 🔴

```typescript
// src/lib/quality-retry-policy.test.ts
import { describe, it, expect } from 'vitest';
import { 
  buildFailureSignature, 
  classifyFailureCategory,
  decideAdaptiveRetry, 
  buildRetryStrategyInstructions,
  resolveQualityRepairMaxAttempts,
  resolveRepeatedSignatureLimit,
} from './quality-retry-policy';

describe('Quality Retry Policy', () => {
  describe('buildFailureSignature', () => {
    it('should create normalized signature from failure lines', () => {
      const lines = [
        'TS2322: Type string is not assignable to type number',
        'TS2322: Type string is not assignable to type number', // duplicate
      ];
      const signature = buildFailureSignature(lines);
      expect(signature).toBe('ts#: type is not assignable to type #');
    });

    it('should normalize numbers in signature', () => {
      const lines = ['Error on line 123', 'Error on line 456'];
      const signature = buildFailureSignature(lines);
      expect(signature).toBe('error on line #');
    });
  });

  describe('decideAdaptiveRetry', () => {
    it('should start with local_patch strategy', () => {
      const result = decideAdaptiveRetry({
        attempt: 1,
        maxAttempts: 3,
        blockingFailures: ['TS2322: Type mismatch'],
        blockingCount: 1,
        signature: 'ts#: type mismatch',
        signatureAttempts: 1,
        noProgressStreak: 0,
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.strategy).toBe('local_patch');
    });

    it('should escalate to expanded_context on repeated signature', () => {
      const result = decideAdaptiveRetry({
        attempt: 2,
        maxAttempts: 3,
        blockingFailures: ['TS2322: Type mismatch'],
        blockingCount: 1,
        signature: 'ts#: type mismatch',
        signatureAttempts: 2,
        noProgressStreak: 1,
        previousAttempt: {
          strategy: 'local_patch',
          signature: 'ts#: type mismatch',
          blockingCount: 1,
          category: 'typing',
        },
      });

      expect(result.strategy).toBe('expanded_context');
    });

    it('should abort on no progress for 2 consecutive retries', () => {
      const result = decideAdaptiveRetry({
        attempt: 3,
        maxAttempts: 3,
        blockingFailures: ['TS2322: Type mismatch'],
        blockingCount: 1,
        signature: 'ts#: type mismatch',
        signatureAttempts: 3,
        noProgressStreak: 2,
        previousAttempt: {
          strategy: 'expanded_context',
          signature: 'ts#: type mismatch',
          blockingCount: 1,
          category: 'typing',
        },
      });

      expect(result.shouldContinue).toBe(false);
      expect(result.strategy).toBe('strategy_shift');
      expect(result.reason).toContain('aborting');
    });

    it('should classify failure categories correctly', () => {
      const testCases = [
        { lines: ['TS6133: x is declared but never read'], expected: 'lint-unused' },
        { lines: ['ESLint: no-unused-vars'], expected: 'lint' },
        { lines: ['TS2322: Type mismatch'], expected: 'typing' },
        { lines: ['Cannot find module'], expected: 'import-export' },
        { lines: ['Unexpected token'], expected: 'syntax' },
        { lines: ['Cypress: Timed out'], expected: 'tests' },
      ];

      testCases.forEach(({ lines, expected }) => {
        // Note: classifyFailureCategory is internal, test via decideAdaptiveRetry
        const result = decideAdaptiveRetry({
          attempt: 1,
          maxAttempts: 3,
          blockingFailures: lines,
          blockingCount: 1,
          signature: 'test',
          signatureAttempts: 1,
          noProgressStreak: 0,
        });
        expect(result.category).toBe(expected);
      });
    });
  });

  describe('buildRetryStrategyInstructions', () => {
    it('should generate local_patch instructions', () => {
      const instructions = buildRetryStrategyInstructions({
        strategy: 'local_patch',
        attempt: 1,
        maxAttempts: 3,
        blockingFailures: ['TS2322'],
        changedFromPrevious: 'Initial attempt',
      });

      expect(instructions).toContain('RETRY STRATEGY: local_patch');
      expect(instructions).toContain('cheapest local fix');
    });

    it('should generate strategy_shift instructions', () => {
      const instructions = buildRetryStrategyInstructions({
        strategy: 'strategy_shift',
        attempt: 3,
        maxAttempts: 3,
        blockingFailures: ['TS2322'],
        changedFromPrevious: 'Previous strategies failed',
      });

      expect(instructions).toContain('RETRY STRATEGY: strategy_shift');
      expect(instructions).toContain('materially different fix path');
    });
  });

  describe('Environment Configuration', () => {
    it('should respect AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS', () => {
      process.env.AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS = '5';
      expect(resolveQualityRepairMaxAttempts()).toBe(5);
      delete process.env.AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS;
    });

    it('should cap max attempts at 5', () => {
      process.env.AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS = '100';
      expect(resolveQualityRepairMaxAttempts()).toBe(5);
      delete process.env.AI_AGENTS_QUALITY_REPAIR_MAX_ATTEMPTS;
    });
  });
});
```

**Estimated Lines:** ~180  
**Coverage Impact:** Retry logic prevents infinite loops - critical for reliability

---

#### 4.1.7 Text & Token Utilities (`lib/text-utils.ts`, `lib/token-estimation.ts`) 🔴

```typescript
// src/lib/text-utils.test.ts
import { describe, it, expect } from 'vitest';
import { unique, trimText, normalizeIssueLine, uniqueNormalized } from './text-utils';

describe('Text Utilities', () => {
  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should trim values', () => {
      expect(unique(['  a  ', 'a', '  b  '])).toEqual(['a', 'b']);
    });

    it('should filter empty strings', () => {
      expect(unique(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('trimText', () => {
    it('should not trim short text', () => {
      expect(trimText('short', 100)).toBe('short');
    });

    it('should trim long text with ellipsis', () => {
      const long = 'a'.repeat(300);
      const result = trimText(long, 100);
      expect(result.length).toBe(100);
      expect(result).endsWith('…');
    });
  });

  describe('uniqueNormalized', () => {
    it('should normalize and deduplicate', () => {
      const input = [
        'Error: TS2322 on line 123',
        'Error: TS2322 on line 456',
        'ERROR: TS2322 ON LINE 789',
      ];
      const result = uniqueNormalized(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Error: TS2322 on line #');
    });
  });
});

// src/lib/token-estimation.test.ts
import { describe, it, expect } from 'vitest';
import { 
  estimateTokens, 
  estimateTokensFromChars, 
  estimateCostUsd,
  buildTokenEstimate,
} from './token-estimation';

describe('Token Estimation', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens from text', () => {
      const text = 'Hello, world!';
      const tokens = estimateTokens(text);
      expect(tokens).toBe(Math.ceil(text.length / 3.8));
    });

    it('should handle empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('estimateCostUsd', () => {
    it('should calculate cost for known model', () => {
      const cost = estimateCostUsd({
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
      });
      // gpt-4o: $0.0025/1K input, $0.01/1K output
      expect(cost).toBeCloseTo(0.0025 + 0.005, 6);
    });

    it('should return 0 for unknown model without env override', () => {
      const cost = estimateCostUsd({
        model: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 1000,
      });
      expect(cost).toBe(0);
    });
  });

  describe('buildTokenEstimate', () => {
    it('should build complete estimate from text', () => {
      const result = buildTokenEstimate({
        model: 'gpt-4o-mini',
        inputText: 'a'.repeat(3800), // ~1000 tokens
        outputText: 'b'.repeat(1900), // ~500 tokens
      });

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
      expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });
});
```

**Estimated Lines:** ~100  
**Coverage Impact:** Utilities are used throughout - high leverage

---

#### 4.1.8 Cypress Tools (`lib/cypress-tools.ts`) 🔴

```typescript
// src/lib/cypress-tools.test.ts
import { describe, it, expect } from 'vitest';
import { 
  parseCypressJunitDiagnostics,
  collectSelectorsFromSpec,
  hasNativeDataCySelector,
} from './cypress-tools';

describe('Cypress Tools', () => {
  describe('parseCypressJunitDiagnostics', () => {
    it('should parse JUnit XML failures', () => {
      const xml = `
        <testsuites>
          <testcase name="should login" classname="Login">
            <failure message="Expected true to be false">
              AssertionError: Expected true to be false
              at Context.eval (cypress/e2e/login.cy.ts:10:5)
            </failure>
          </testcase>
        </testsuites>
      `;

      const result = parseCypressJunitDiagnostics(xml);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('should login');
      expect(result[0]).toContain('Expected true to be false');
    });

    it('should extract file locations', () => {
      const xml = `
        <testcase name="test">
          <failure>
            Error at cypress/e2e/app.cy.ts:25:10
          </failure>
        </testcase>
      `;

      const result = parseCypressJunitDiagnostics(xml);
      expect(result).toContainEqual(
        expect.stringContaining('cypress/e2e/app.cy.ts:25:10'),
      );
    });

    it('should handle empty XML', () => {
      expect(parseCypressJunitDiagnostics('')).toEqual([]);
    });
  });

  describe('collectSelectorsFromSpec', () => {
    it('should extract data-cy selectors', () => {
      const content = `
        cy.get('[data-cy="login-button"]').click();
        cy.get('[data-cy="username"]').type('user');
        cy.get('[data-cy="login-button"]').should('be.visible');
      `;

      const result = collectSelectorsFromSpec(content);
      expect(result).toEqual(['login-button', 'username']);
    });

    it('should deduplicate selectors', () => {
      const content = `
        cy.get('[data-cy="btn"]').click();
        cy.get('[data-cy="btn"]').should('exist');
      `;

      const result = collectSelectorsFromSpec(content);
      expect(result).toEqual(['btn']);
    });
  });

  describe('hasNativeDataCySelector', () => {
    it('should detect data-cy in JSX', () => {
      const content = '<button data-cy="submit">Submit</button>';
      expect(hasNativeDataCySelector(content, 'submit')).toBe(true);
    });

    it('should return false for missing selector', () => {
      const content = '<button data-cy="submit">Submit</button>';
      expect(hasNativeDataCySelector(content, 'cancel')).toBe(false);
    });

    it('should handle special characters in selector', () => {
      const content = '<div data-cy="user-item-123">User</div>';
      expect(hasNativeDataCySelector(content, 'user-item-123')).toBe(true);
    });
  });
});
```

**Estimated Lines:** ~100  
**Coverage Impact:** E2E validation is critical for quality gates

---

### Phase 2: MEDIUM PRIORITY - Commands & CLI (Target: 15% coverage)

#### 4.2.1 Commands Testing Strategy 🟡

Commands are primarily integration tests (CLI interaction). Focus on:
- Input validation
- Error handling paths
- Help text

```typescript
// src/commands/new.test.ts (example)
import { describe, it, expect, vi } from 'vitest';
import { newCommand } from './new';
import { createTask } from '../lib/task';

vi.mock('../lib/task');
vi.mock('@inquirer/prompts');

describe('newCommand', () => {
  it('should create task with provided title', async () => {
    vi.mocked(createTask).mockResolvedValue({ 
      taskId: 'task-123', 
      taskPath: '/mock' 
    });

    await newCommand.parseAsync(['node', 'synx', 'new', 'Test task', '--type', 'Feature']);

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test task',
        typeHint: 'Feature',
      }),
    );
  });
});
```

**Key Command Tests:**
- `commands/start.ts` - Engine loop logic, recovery flows
- `commands/new.ts` - Task creation validation
- `commands/setup.ts` - Config validation
- `commands/status.ts` - Task filtering logic
- `commands/doctor.ts` - Readiness check aggregation

---

#### 4.2.2 Worker Base Class (`workers/base.ts`) 🟡

```typescript
// src/workers/base.test.ts
import { describe, it, expect, vi } from 'vitest';
// WorkerBase is abstract - test through concrete implementations
```

**Strategy:** Test through concrete workers (dispatcher, planner, etc.)

---

### Phase 3: LOW PRIORITY - UI & Utilities (Target: 5% coverage)

#### 4.3.1 UI Rendering 🟢

```typescript
// src/lib/synx-ui.test.ts (spot checks only)
import { describe, it, expect } from 'vitest';
import { formatSynxStatus, renderSynxLogo } from './synx-ui';

describe('SYNX UI', () => {
  describe('formatSynxStatus', () => {
    it('should format status with color', () => {
      const result = formatSynxStatus('processing');
      expect(result).toBeTruthy();
    });
  });
});
```

---

## 5. Test Coverage Summary

### 5.1 Coverage Targets by Priority

| Priority | Modules | Target Coverage | Estimated Test Lines |
|----------|---------|-----------------|---------------------|
| 🔴 HIGH | 16 core modules | 30% | ~1,330 |
| 🟡 MEDIUM | 11 command modules + workers | 15% | ~600 |
| 🟢 LOW | 20 utility modules | 5% | ~200 |
| **TOTAL** | **47 modules** | **50%+** | **~2,130** |

### 5.2 Coverage by Module Type

| Module Type | Files | Lines (est.) | Target % | Priority |
|-------------|-------|--------------|----------|----------|
| Schemas | 1 | 400 | 90% | 🔴 |
| Config/Task/Runtime | 3 | 600 | 80% | 🔴 |
| Validation/Editor | 2 | 500 | 75% | 🔴 |
| Providers | 4 | 400 | 60% | 🟡 |
| Workers | 9 | 900 | 50% | 🟡 |
| Commands | 11 | 600 | 40% | 🟡 |
| Utilities | 17 | 800 | 30% | 🟢 |

---

## 6. Implementation Roadmap

### Week 1: Foundation (HIGH Priority)
- [ ] Setup Vitest configuration
- [ ] Implement schema tests (`schema.test.ts`)
- [ ] Implement config tests (`config.test.ts`)
- [ ] Implement task tests (`task.test.ts`)
- [ ] Implement runtime tests (`runtime.test.ts`)

### Week 2: Core Logic (HIGH Priority)
- [ ] Implement workspace editor tests
- [ ] Implement quality retry policy tests
- [ ] Implement text/token utility tests
- [ ] Implement Cypress tools tests
- [ ] Implement validation-checks tests

### Week 3: Integration (MEDIUM Priority)
- [ ] Implement worker tests (through concrete implementations)
- [ ] Implement command tests (focus on start.ts, new.ts)
- [ ] Implement provider tests (mock provider first)

### Week 4: Polish (LOW Priority)
- [ ] Implement utility tests
- [ ] Add spot checks for UI rendering
- [ ] Review coverage report
- [ ] Add integration tests for critical paths

---

## 7. Recommended Test Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## 8. Critical Test Scenarios

### 8.1 Must-Test Scenarios

1. **Task Lifecycle** - Create → Process → Complete
2. **Lock Recovery** - Stale lock detection and clearing
3. **Working File Recovery** - Interrupted task requeue
4. **Edit Application** - All edit types (create, replace, replace_snippet, delete)
5. **Path Safety** - Blocked path rejection, escape prevention
6. **Schema Validation** - All agent output schemas
7. **Retry Logic** - Strategy escalation, abort conditions
8. **Config Merging** - Global + local + overrides
9. **Provider Errors** - Rate limit, backoff, retry extraction
10. **Cypress Integration** - XML parsing, selector detection

### 8.2 Edge Cases

- Empty task lists
- Malformed JSON files
- Missing directories
- Concurrent lock attempts
- Dead process PIDs
- Invalid edit actions
- Missing edit content
- Path traversal attempts
- Environment variable overrides
- Cache invalidation

---

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| No test safety net | HIGH | Implement Phase 1 immediately |
| Autonomous file edits | HIGH | Test workspace-editor thoroughly |
| Race conditions | MEDIUM | Test lock management extensively |
| Provider failures | MEDIUM | Test error extraction and retry |
| Config corruption | MEDIUM | Test schema validation strictly |

---

## 10. Conclusion

SYNX is a sophisticated multi-agent orchestrator with **zero test coverage**. The system's autonomous nature (making real file edits) combined with the lack of tests represents a **critical risk**.

**Immediate Actions Required:**
1. Add Vitest as dev dependency
2. Implement Phase 1 tests (core business logic)
3. Add CI pipeline with coverage thresholds
4. Require tests for all new features

**Success Metrics:**
- 50%+ overall coverage
- 80%+ coverage on core modules (schema, config, task, runtime)
- All critical paths tested
- No regressions in file edit safety

---

*This evaluation was generated based on repository analysis. Actual implementation may require adjustments based on evolving requirements.*
