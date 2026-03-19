import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

export async function createTestActionContext(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "tasks"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".ai-agents", "runtime", "locks"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "synx-expert-test", scripts: { test: "vitest run" } }, null, 2),
    "utf8"
  );
  return { root, repoRoot };
}
