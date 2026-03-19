import path from "node:path";
import { existsSync } from "node:fs";
import { selectPackageManager, buildScriptCommand, type PackageManager } from "./package-manager.js";

export interface SanityCommand {
  label: string;
  command: string;
  args: string[];
  note: string;
  category: "cheap" | "heavy";
  isFullBuild?: boolean;
}

function looksLikeCodeFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized) || normalized.endsWith("package.json");
}

function inferScriptCategory(script: string, scriptBody: string): "cheap" | "heavy" {
  if (script === "build") return "heavy";
  if (script === "check" && /\b(build|test|playwright|e2e|vitest|jest|mocha)\b/i.test(scriptBody)) {
    return "heavy";
  }
  return "cheap";
}

function chooseSanityScripts(args: {
  scripts: Record<string, string>;
  changedFiles: string[];
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
}): Array<{ script: string; category: "cheap" | "heavy" }> {
  const out: Array<{ script: string; category: "cheap" | "heavy" }> = [];
  const changedCode = args.changedFiles.some(looksLikeCodeFile);
  const scripts = args.scripts;
  const requireBuildScript = Boolean(args.requireBuildScript);

  if (scripts.lint) out.push({ script: "lint", category: "cheap" });
  if (scripts.typecheck) out.push({ script: "typecheck", category: "cheap" });

  if (scripts.check && !out.some((item) => item.script === "check")) {
    const checkCategory = inferScriptCategory("check", scripts.check);
    if (!(checkCategory === "heavy" && scripts.build)) {
      out.push({ script: "check", category: checkCategory });
    }
  }
  if ((changedCode || requireBuildScript) && scripts.build && !out.some((item) => item.script === "build")) {
    out.push({ script: "build", category: "heavy" });
  }

  const dedup = new Map<string, { script: string; category: "cheap" | "heavy" }>();
  for (const item of out) {
    if (!dedup.has(item.script)) dedup.set(item.script, item);
  }
  return Array.from(dedup.values());
}

function hasChangedFile(changedFiles: string[], pattern: RegExp): boolean {
  return changedFiles.some((file) => pattern.test(file.toLowerCase()));
}

function buildTypeScriptNoEmitCommand(manager: PackageManager): SanityCommand {
  const common = {
    note: "Language-aware sanity check for TypeScript (compile/type/syntax without emit).",
    category: "cheap" as const,
  };
  switch (manager) {
    case "pnpm": return { label: "pnpm exec tsc --noEmit", command: "pnpm", args: ["exec", "tsc", "--noEmit"], ...common };
    case "yarn": return { label: "yarn tsc --noEmit", command: "yarn", args: ["tsc", "--noEmit"], ...common };
    case "bun": return { label: "bunx tsc --noEmit", command: "bunx", args: ["tsc", "--noEmit"], ...common };
    case "npm":
    default: return { label: "npx tsc --noEmit", command: "npx", args: ["exec", "tsc", "--noEmit"], ...common };
  }
}

function buildFallbackLanguageCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  manager: PackageManager;
  scriptsChosen: string[];
}): SanityCommand[] {
  const out: SanityCommand[] = [];
  const { workspaceRoot, changedFiles, manager, scriptsChosen } = args;
  const hasTsConfig = existsSync(path.join(workspaceRoot, "tsconfig.json"));
  const hasTypeScriptChanges = hasChangedFile(changedFiles, /\.(ts|tsx)$/);

  const scriptSet = new Set(scriptsChosen.map((x) => x.toLowerCase()));
  const alreadyHasTsScriptCoverage = scriptSet.has("typecheck") || scriptSet.has("check");
  if (hasTsConfig && (hasTypeScriptChanges || changedFiles.length === 0) && !alreadyHasTsScriptCoverage) {
    out.push(buildTypeScriptNoEmitCommand(manager));
  }

  const langFiles = [
    { ext: /\.py$/, files: ["pyproject.toml", "requirements.txt", "setup.py"], cmd: "python3", args: ["-m", "py_compile"], label: "python3 -m py_compile", note: "Language-aware sanity check for Python syntax." },
    { ext: /\.go$/, files: ["go.mod"], cmd: "go", args: ["test", "./...", "-run", "^$"], label: "go test ./... -run ^$", note: "Language-aware sanity check for Go compile/link." },
    { ext: /\.rs$/, files: ["Cargo.toml"], cmd: "cargo", args: ["check"], label: "cargo check", note: "Language-aware sanity check for Rust compilation." },
  ];

  for (const lang of langFiles) {
    if (hasChangedFile(changedFiles, lang.ext) && lang.files.some(f => existsSync(path.join(workspaceRoot, f)))) {
      if (lang.cmd === "python3") {
         const pyFiles = changedFiles.filter(f => /\.py$/i.test(f)).slice(0, 20);
         if (pyFiles.length) out.push({ label: `${lang.label} ${pyFiles.join(" ")}`, command: lang.cmd, args: [...lang.args, ...pyFiles], note: lang.note, category: "cheap" });
      } else {
         out.push({ label: lang.label, command: lang.cmd, args: lang.args, note: lang.note, category: "cheap" });
      }
    }
  }

  if (hasChangedFile(changedFiles, /\.java$/)) {
    if (existsSync(path.join(workspaceRoot, "pom.xml"))) {
       out.push({ label: "mvn -q -DskipTests compile", command: "mvn", args: ["-q", "-DskipTests", "compile"], note: "Language-aware sanity check for Java compilation (Maven).", category: "cheap" });
    } else if (existsSync(path.join(workspaceRoot, "gradlew"))) {
       out.push({ label: "./gradlew -q classes", command: "./gradlew", args: ["-q", "classes"], note: "Language-aware sanity check for Java/Kotlin compilation (Gradle).", category: "cheap" });
    }
  }

  return out;
}

export function resolveSanityCommands(args: {
  workspaceRoot: string;
  changedFiles: string[];
  scripts: Record<string, string>;
  manager: PackageManager;
  requireLintScript?: boolean;
  requireBuildScript?: boolean;
}): { cheap: SanityCommand[]; heavy: SanityCommand[] } {
  const scriptChoices = chooseSanityScripts({
    scripts: args.scripts,
    changedFiles: args.changedFiles,
    requireLintScript: args.requireLintScript,
    requireBuildScript: args.requireBuildScript,
  });
  const scriptCommands: SanityCommand[] = scriptChoices.map((item) => {
    const command = buildScriptCommand(args.manager, item.script);
    return {
      label: `${command.command} ${command.args.join(" ")}`,
      command: command.command,
      args: command.args,
      note: item.category === "heavy" ? "Heavy script-based sanity check." : "Cheap script-based sanity check.",
      category: item.category,
      isFullBuild: item.script === "build",
    };
  });

  const fallbackCommands = buildFallbackLanguageCommands({
    workspaceRoot: args.workspaceRoot,
    changedFiles: args.changedFiles,
    manager: args.manager,
    scriptsChosen: scriptChoices.map((item) => item.script),
  });

  const allCommands = [...scriptCommands, ...fallbackCommands];
  const seen = new Set<string>();
  const deduped = allCommands.filter((cmd) => {
    const key = `${cmd.command}::${cmd.args.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const cheap = deduped.filter((cmd) => cmd.category === "cheap").slice(0, 3);
  const heavy = deduped.filter((cmd) => cmd.category === "heavy").slice(0, 1);
  return { cheap, heavy };
}
