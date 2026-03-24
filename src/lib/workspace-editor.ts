import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, exists } from "./fs.js";
import { envBoolean } from "./env.js";
import { unique } from "./text-utils.js";
import { isBlockedPath, normalizeInputPath } from "./workspace-scanner.js";
import { acquireFileLocks } from "./file-locks.js";

export type WorkspaceEditAction = "create" | "replace" | "replace_snippet" | "delete";

export interface WorkspaceEdit {
  path: string;
  action: WorkspaceEditAction;
  content?: string;
  find?: string;
  replace?: string;
}

export interface AppliedWorkspaceEdits {
  appliedFiles: string[];
  changedFiles: string[];
  skippedEdits: string[];
  warnings: string[];
}

function isInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

export function resolveWorkspacePath(workspaceRoot: string, filePath: string): { absolutePath: string; relativePath: string } {
  const root = path.resolve(workspaceRoot);
  const normalizedInput = normalizeInputPath(filePath);
  if (!normalizedInput) throw new Error("Edit path is empty.");

  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(root, normalizedInput);

  if (!isInsideRoot(root, absolutePath)) {
    throw new Error(`Path escapes workspace root: ${filePath}`);
  }

  const relativePath = normalizeInputPath(path.relative(root, absolutePath));
  if (isBlockedPath(relativePath)) {
    throw new Error(`Path is protected and cannot be edited: ${relativePath}`);
  }

  return { absolutePath, relativePath };
}

export async function applyWorkspaceEdits(args: {
  workspaceRoot: string;
  edits: WorkspaceEdit[];
  dryRun?: boolean;
  taskId?: string;
}): Promise<AppliedWorkspaceEdits> {
  const dryRun = typeof args.dryRun === "boolean" ? args.dryRun : envBoolean("AI_AGENTS_DRY_RUN", false);
  const appliedFiles: string[] = [];
  const changedFiles: string[] = [];
  const skippedEdits: string[] = [];
  const warnings: string[] = [];

  if (dryRun) {
    warnings.push("Dry-run mode is enabled. Workspace edits are simulated and no files are written.");
  }

  // Phase 1.4 — File conflict detection (advisory; does not block edits)
  const taskId = args.taskId ?? "";
  if (taskId && !dryRun) {
    const plannedFiles = args.edits
      .filter((e) => e.path)
      .map((e) => { try { return resolveWorkspacePath(args.workspaceRoot, e.path).relativePath; } catch { return ""; } })
      .filter(Boolean);

    if (plannedFiles.length > 0) {
      const lockResult = await acquireFileLocks(taskId, plannedFiles);
      if (lockResult.conflicts.length > 0) {
        for (const c of lockResult.conflicts) {
          warnings.push(`[file-lock] Conflict on "${c.file}" — held by task ${c.heldBy}. Proceeding but results may conflict.`);
        }
      }
    }
  }

  for (const edit of args.edits) {
    try {
      const { absolutePath, relativePath } = resolveWorkspacePath(args.workspaceRoot, edit.path);

      if (edit.action === "delete") {
        if (await exists(absolutePath)) {
          if (!dryRun) {
            await fs.unlink(absolutePath);
          }
          appliedFiles.push(relativePath);
          changedFiles.push(relativePath);
        } else {
          skippedEdits.push(`${relativePath} (delete skipped: file does not exist)`);
        }
        continue;
      }

      if (edit.action === "replace_snippet") {
        if (!(await exists(absolutePath))) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: file does not exist)`);
          continue;
        }
        if (typeof edit.find !== "string" || !edit.find.length || typeof edit.replace !== "string") {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: missing find/replace)`);
          continue;
        }

        const current = await fs.readFile(absolutePath, "utf8");
        if (!current.includes(edit.find)) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: target snippet not found)`);
          continue;
        }

        const next = current.replace(edit.find, edit.replace);
        if (next === current) {
          skippedEdits.push(`${relativePath} (replace_snippet skipped: replacement produced no changes)`);
          continue;
        }
        if (!dryRun) {
          await fs.writeFile(absolutePath, next, "utf8");
        }
        appliedFiles.push(relativePath);
        changedFiles.push(relativePath);
        continue;
      }

      if (typeof edit.content !== "string") {
        skippedEdits.push(`${relativePath} (${edit.action} skipped: missing content)`);
        continue;
      }

      const existed = await exists(absolutePath);
      if (existed) {
        const current = await fs.readFile(absolutePath, "utf8").catch(() => null);
        if (typeof current === "string" && current === edit.content) {
          skippedEdits.push(`${relativePath} (${edit.action} skipped: content unchanged)`);
          continue;
        }
      }

      await ensureDir(path.dirname(absolutePath));
      if (!dryRun) {
        await fs.writeFile(absolutePath, edit.content, "utf8");
      }
      appliedFiles.push(relativePath);
      changedFiles.push(relativePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Edit skipped for "${edit.path}": ${message}`);
    }
  }

  return {
    appliedFiles: unique(appliedFiles),
    changedFiles: unique(changedFiles),
    skippedEdits: unique(skippedEdits),
    warnings: unique(warnings),
  };
}
