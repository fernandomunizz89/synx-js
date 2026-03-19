import { unique } from "./text-utils.js";
import { type ProjectProfile } from "./project-detector.js";
import { type BugBrief } from "./bug-triage.js";
import { type SymbolContract } from "./symbol-contract-parser.js";

export { type ProjectProfile, collectProjectProfile, walkFiles } from "./project-detector.js";
export { type BugBrief, type InvestigationCheck, runBugTriageChecks, buildBugBrief } from "./bug-triage.js";
export { type SymbolContract, deriveSymbolContracts } from "./symbol-contract-parser.js";

export function projectProfileFactLines(profile: ProjectProfile): string[] {
  return unique([
    `Project profile: manager=${profile.packageManager}, languages=${profile.detectedLanguages.join(", ") || "unknown"}, frameworks=${profile.detectedFrameworks.join(", ") || "unknown"}.`,
    `Scripts: lint=${profile.scriptSummary.lint.join(", ") || "[none]"} | typecheck=${profile.scriptSummary.typecheck.join(", ") || "[none]"} | e2e=${profile.scriptSummary.e2e.join(", ") || "[none]"}.`,
    `Tooling: tsconfig=${profile.tooling.hasTsConfig ? "yes" : "no"}, playwrightConfig=${profile.tooling.hasPlaywrightConfig ? "yes" : "no"}.`,
  ]);
}

export function bugBriefFactLines(brief: BugBrief): string[] {
  return unique([
    `Bug brief: ${brief.symptomSummary}`,
    `Primary hypothesis: ${brief.primaryHypothesis}`,
    `Suspect files: ${brief.suspectFiles.slice(0, 5).join(", ") || "[none identified]"}.`,
    ...brief.triageChecks.map((check) => `${check.command} => ${check.status} (exit=${check.exitCode ?? "null"})`),
    ...brief.blockerPatterns.slice(0, 3),
    ...brief.builderChecks.slice(0, 2),
  ]).slice(0, 8);
}

export function symbolContractFactLines(contracts: SymbolContract[]): string[] {
  return contracts.slice(0, 6).map((contract) => {
    return `Symbol contract: ${contract.symbol} in ${contract.modulePath} | importer=${contract.importerPath || "[unknown]"} | ${contract.mismatchSummary}`;
  });
}
