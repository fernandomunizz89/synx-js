import { describe, expect, it, vi, beforeEach } from "vitest";
import { 
  normalizeQaIssueKey, 
  issuesLookEquivalent, 
  inferPreModelRetryLimit,
  resolveDynamicRetryLimit,
  isE2eCheckCommand,
  extractSourceLocations,
  compactChecksForModel,
  buildFallbackQaTestCases,
  buildCheckDrivenReturnContext,
  isMissingE2eSpecText,
  isConfigRelatedText,
  isSelectorRelatedText,
  isImportExportRelatedText,
  isLowSignalQaText,
  hasOnlyRootCauseHintEvidence,
  buildSelectorPreflightReturnContext,
  buildMissingE2eSpecReturnContext,
  filterUnsupportedConfigReturnContext,
  filterUnsupportedSelectorReturnContext,
  filterUnsupportedImportExportReturnContext,
  pickBestFailedCheckForContextItem,
  hasStaticValueMismatchSignal,
  hasMissingE2eSpecSignal,
  hasConfigFailureSignal,
  hasSelectorFailureSignal,
  hasImportExportFailureSignal,
  enrichSparseReturnContextWithCheckEvidence,
  pruneLowSignalReturnContextItems,
  enrichReturnContextWithRootCauseHints,
  collapseWorkspacePathLabels,
  extractIssueCandidatesFromHistory,
  compactQaReturnContextItems,
  buildFallbackQaReturnContextItems,
  qaWorker
} from "./qa.js";
import * as config from "../lib/config.js";
import * as workspaceTools from "../lib/workspace-tools.js";
import * as task from "../lib/task.js";
import * as codeQualityBootstrap from "../lib/code-quality-bootstrap.js";
import * as factory from "../providers/factory.js";

vi.mock("../lib/config.js");
vi.mock("../lib/workspace-tools.js");
vi.mock("../lib/task.js");
vi.mock("../lib/code-quality-bootstrap.js");
vi.mock("../providers/factory.js");
vi.mock("../lib/fs.js", () => ({
  exists: vi.fn(() => true),
  readJson: vi.fn(),
  writeJson: vi.fn(),
  readText: vi.fn(),
  existsSync: vi.fn(() => true)
}));

describe("workers/qa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeQaIssueKey", () => {
    it("removes paths and numeric noise", () => {
      const input = "Error at C:\\Users\\Name\\file.ts:10:5 exit code 1";
      const normalized = normalizeQaIssueKey(input);
      expect(normalized).toBe("error at path exit code");
    });
  });

  describe("issuesLookEquivalent", () => {
    it("returns true for exact matches", () => {
      expect(issuesLookEquivalent("test error", "test error")).toBe(true);
    });
    it("returns true for overlapping tokens", () => {
      expect(issuesLookEquivalent("failed to load module foo", "module foo failed to load")).toBe(true);
    });
  });

  describe("inferPreModelRetryLimit", () => {
    it("returns diverse limit for no history", () => {
      const limit = inferPreModelRetryLimit([], { sameIssueMaxRetries: 3, diverseIssueMaxRetries: 5 });
      expect(limit).toBe(5);
    });
    it("returns same limit if repeated issues found", () => {
      const history = [
        { summary: "fail A", failures: [], findings: [] },
        { summary: "fail A", failures: [], findings: [] },
      ] as any;
      const limit = inferPreModelRetryLimit(history, { sameIssueMaxRetries: 3, diverseIssueMaxRetries: 5 });
      expect(limit).toBe(3);
    });
  });

  describe("resolveDynamicRetryLimit", () => {
    it("detects recurrence from current issues", () => {
      const history = [{ summary: "fail A", failures: [], findings: [] }] as any;
      const limit = resolveDynamicRetryLimit({
        history,
        currentIssues: ["fail A"],
        config: { sameIssueMaxRetries: 3, diverseIssueMaxRetries: 5 }
      });
      expect(limit).toBe(3);
    });
  });

  describe("isE2eCheckCommand", () => {
    it("detects e2e related commands", () => {
      expect(isE2eCheckCommand("npx playwright test")).toBe(true);
      expect(isE2eCheckCommand("npm test")).toBe(false);
    });
  });

  describe("compactChecksForModel", () => {
    it("trims stdout/stderr and limits diagnostics", () => {
      const checks = [{
        command: "ls",
        status: "passed",
        exitCode: 0,
        durationMs: 10,
        stdoutPreview: "a".repeat(1000),
        stderrPreview: "b".repeat(1000),
        diagnostics: ["d1", "d2"],
        timedOut: false
      }] as any;
      const compacted = (compactChecksForModel as any)(checks);
      expect(compacted[0].stdoutPreview).toHaveLength(500);
      expect(compacted[0].stderrPreview).toHaveLength(500);
    });
  });

  describe("buildFallbackQaTestCases", () => {
    it("creates test cases from failed checks", () => {
      const cases = (buildFallbackQaTestCases as any)({
        failures: ["F1"],
        returnContext: [],
        executedChecks: [{ command: "test", status: "failed", exitCode: 1, diagnostics: ["Err"] }]
      });
      expect(cases).toHaveLength(1);
      expect(cases[0].title).toContain("Run check: test");
    });
  });

  describe("Signal and filtering", () => {
    it("detects signals", () => {
      expect(isMissingE2eSpecText("No spec files were found")).toBe(true);
      expect(isConfigRelatedText("configFile is invalid")).toBe(true);
      expect(isSelectorRelatedText("data-cy")).toBe(true);
      expect(isImportExportRelatedText("does not provide an export named")).toBe(true);
      expect(isLowSignalQaText("qa validation failed")).toBe(true);
      expect(hasOnlyRootCauseHintEvidence(["Likely source root-cause paths: ..."])).toBe(true);
      expect(hasStaticValueMismatchSignal("expected \"a\" to not equal \"a\"")).toBe(true);
    });

    it("detects failure signals in checks", () => {
      const checks = [{ command: "test", diagnostics: ["configFile is invalid"], stdoutPreview: "", stderrPreview: "" }] as any;
      expect(hasConfigFailureSignal(checks)).toBe(true);
      expect(hasMissingE2eSpecSignal([{ command: "test", diagnostics: ["No spec files were found"], stdoutPreview: "", stderrPreview: "" }] as any)).toBe(true);
      expect(hasSelectorFailureSignal({ missingSelectors: [], checks: [{ command: "test", diagnostics: ["data-cy"], stdoutPreview: "", stderrPreview: "" }] } ) as any).toBe(true);
      expect(hasImportExportFailureSignal([{ command: "test", diagnostics: ["does not provide an export named"], stdoutPreview: "", stderrPreview: "" }] as any)).toBe(true);
    });

    it("builds missing spec return context", () => {
      const checks = [{
        command: "playwright run",
        status: "failed",
        exitCode: 1,
        diagnostics: ["No spec files were found"]
      }] as any;
      const context = buildMissingE2eSpecReturnContext(checks);
      expect(context).toHaveLength(1);
      expect(context[0].issue).toBe("E2E spec files are missing.");
    });

    it("filters unsupported issues when signal is missing", () => {
      const items = [{ issue: "configFile is invalid", expectedResult: "", receivedResult: "", evidence: [], recommendedAction: "" }];
      const filtered = filterUnsupportedConfigReturnContext(items, []);
      expect(filtered).toHaveLength(0);
    });

    it("handles selector preflight logic", () => {
      const context = buildSelectorPreflightReturnContext([{ selector: "s1", specPaths: ["p1"] }]);
      expect(context).toHaveLength(1);
      expect(context[0].issue).toMatch(/Missing.*selector/);
    });
  });

  describe("Context refinement", () => {
    it("picks best failed check", () => {
      const check = pickBestFailedCheckForContextItem({
        item: { issue: "test fail", expectedResult: "", receivedResult: "" },
        failedChecks: [{ command: "test", status: "failed", exitCode: 1, diagnostics: ["test fail evidence"] }]
      } as any);
      expect(check).toBeDefined();
      expect(check?.command).toBe("test");
    });

    it("enriches and prunes context", () => {
      const items = [{ issue: "I1", expectedResult: "E1", receivedResult: "qa validation failed", evidence: [], recommendedAction: "" }];
      const checks = [{ command: "test", status: "failed", diagnostics: ["DIAG"] }] as any;
      const enriched = enrichSparseReturnContextWithCheckEvidence({ items, executedChecks: checks });
      expect(enriched[0].evidence).toContain("Command: test");

      const pruned = pruneLowSignalReturnContextItems([
        { issue: "qa validation failed", evidence: [], expectedResult: "", receivedResult: "", recommendedAction: "" },
        { issue: "Rich Issue", evidence: ["Rich Evidence"], expectedResult: "E", receivedResult: "R", recommendedAction: "A" }
      ] as any);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].issue).toBe("Rich Issue");
    });

    it("enriches with root cause hints", () => {
      const items = [{ 
        issue: "missing selector in src/app.ts", 
        expectedResult: "E", 
        receivedResult: "R", 
        evidence: [], 
        recommendedAction: "A" 
      }];
      const enriched = enrichReturnContextWithRootCauseHints(items as any, { 
        sourceRootCausePaths: ["src/app.ts"], 
        qaFailures: ["missing selector in src/app.ts"], 
        findings: items as any 
      });
      expect(enriched[0].evidence[0]).toContain("Likely source root-cause paths: src/app.ts");
    });
  });

  describe("Workspace path labels", () => {
    it("collapses labels", () => {
      const collapsed = collapseWorkspacePathLabels({
        workspaceRoot: "/root",
        candidates: ["/root/src/app.ts", "/root/src/index.ts"],
        preferredPaths: []
      });
      expect(collapsed).toContain("src/app.ts");
    });
  });

  describe("History and compacting", () => {
    it("extracts issue candidates", () => {
      const history = [{
        summary: "S1",
        failures: ["F1"],
        findings: [{ issue: "FI1" }]
      }] as any;
      const candidates = extractIssueCandidatesFromHistory(history);
      expect(candidates).toContain("S1");
      expect(candidates).toContain("F1");
      expect(candidates).toContain("FI1");
    });

    it("compacts return context items", () => {
      const items = [
        { issue: "I1", expectedResult: "E1", receivedResult: "R1", evidence: ["A"], recommendedAction: "B" },
        { issue: "I1", expectedResult: "E1", receivedResult: "R1", evidence: ["C"], recommendedAction: "D" }
      ];
      const compacted = compactQaReturnContextItems(items as any);
      expect(compacted).toHaveLength(1);
      expect(compacted[0].evidence).toContain("A");
      expect(compacted[0].evidence).toContain("C");
    });

    it("builds fallback context items", () => {
      const items = buildFallbackQaReturnContextItems({
        failures: ["Check failed: npm test (exit 1)"],
        changedFiles: ["src/app.ts"],
        executedChecks: [{ command: "npm test", status: "failed", exitCode: 1 }] as any,
        existing: []
      });
      expect(items).toHaveLength(1);
      expect(items[0].issue).toContain("Failed check: npm test");
    });
  });

  describe("QaWorker.processTask", () => {
    it("processes a task and generates a verdict", async () => {
      vi.mocked(config.loadResolvedProjectConfig).mockResolvedValue({ providers: { dispatcher: "openai" } } as any);
      vi.mocked(config.loadPromptFile).mockResolvedValue("System Prompt {{INPUT_JSON}}");
      vi.mocked(config.resolveProviderConfigForAgent).mockReturnValue({} as any);
      
      const mockProvider = {
        generateStructured: vi.fn().mockResolvedValue({
          parsed: {
            verdict: "pass",
            failures: [],
            returnContext: [],
            testCases: [],
            e2ePlan: [],
            changedFiles: [],
            filesReviewed: [],
            validationMode: "executed_checks",
            technicalRiskSummary: { 
              buildRisk: "low",
              syntaxRisk: "low",
              importExportRisk: "low",
              referenceRisk: "low",
              logicRisk: "low",
              regressionRisk: "low"
            },
            recommendedChecks: [],
            manualValidationNeeded: [],
            residualRisks: [],
            mainScenarios: ["Test scenario"],
            acceptanceChecklist: ["Criteria 1"],
            nextAgent: "Human Review",
            executedChecks: []
          }
        })
      };
      vi.mocked(factory.createProvider).mockReturnValue(mockProvider as any);
      vi.mocked(task.loadTaskMeta).mockResolvedValue({ history: [] } as any);
      vi.mocked(codeQualityBootstrap.ensureCodeQualityBootstrap).mockResolvedValue({ changedFiles: [], notes: [], warnings: [] } as any);
      vi.mocked(workspaceTools.getGitChangedFiles).mockResolvedValue(["src/app.ts"]);
      vi.mocked(workspaceTools.detectTestCapabilities).mockResolvedValue({ hasUnitTestScript: true } as any);
      vi.mocked(workspaceTools.runProjectChecks).mockResolvedValue([{ 
        command: "npm test", 
        status: "passed", 
        stdoutPreview: "OK", 
        stderrPreview: "", 
        exitCode: 0, 
        timedOut: false, 
        durationMs: 100,
        diagnostics: [],
        qaConfigNotes: [],
        artifacts: []
      }] as any);

      // qaWorker is now exported
      vi.spyOn(qaWorker as any, "buildAgentInput").mockResolvedValue({ task: { typeHint: "Feature" } });
      vi.spyOn(qaWorker as any, "note").mockResolvedValue({} as any);
      vi.spyOn(qaWorker as any, "finishStage").mockResolvedValue({} as any);

      await (qaWorker as any).processTask("T1", { stage: "qa" });

      expect(mockProvider.generateStructured).toHaveBeenCalled();
    });
  });
});
