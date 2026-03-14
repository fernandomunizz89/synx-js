import path from "node:path";
import { existsSync } from "node:fs";

export function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    const hasGit = existsSync(path.join(current, ".git"));
    const hasAiAgents = existsSync(path.join(current, ".ai-agents"));
    const hasPackageJson = existsSync(path.join(current, "package.json"));

    if (hasGit || hasAiAgents || hasPackageJson) return current;

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}
