interface NormalizedModelOutput {
  payload: unknown;
  notes: string[];
}

function normalizePathLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "[unknown path]";
  return value.trim();
}

function normalizeEditItem(edit: unknown, index: number): { next: Record<string, unknown> | null; notes: string[] } {
  if (!edit || typeof edit !== "object") {
    return {
      next: null,
      notes: [`Dropped invalid edit at index ${index}: expected an object edit entry.`],
    };
  }

  const item = { ...(edit as Record<string, unknown>) };
  const path = normalizePathLabel(item.path);
  const action = typeof item.action === "string" ? item.action : "";
  const notes: string[] = [];

  if (!path || path === "[unknown path]") {
    return {
      next: null,
      notes: [`Dropped invalid edit at index ${index}: missing target path.`],
    };
  }

  if (!["create", "replace", "replace_snippet", "delete"].includes(action)) {
    return {
      next: null,
      notes: [`Dropped invalid edit for ${path}: unknown action "${action || "[missing]"}".`],
    };
  }

  if (action === "replace_snippet") {
    const hasFind = typeof item.find === "string" && item.find.length > 0;
    const hasReplace = typeof item.replace === "string";

    if (!hasFind || !hasReplace) {
      if (typeof item.content === "string") {
        item.action = "replace";
        delete item.find;
        delete item.replace;
        notes.push(`Recovered malformed replace_snippet for ${path} by converting it to a full-file replace edit.`);
      } else {
        return {
          next: null,
          notes: [`Dropped malformed replace_snippet for ${path}: missing find/replace and no fallback content.`],
        };
      }
    }
  }

  const effectiveAction = typeof item.action === "string" ? item.action : action;
  if ((effectiveAction === "create" || effectiveAction === "replace") && typeof item.content !== "string") {
    return {
      next: null,
      notes: [`Dropped invalid ${effectiveAction} edit for ${path}: missing content.`],
    };
  }

  return { next: item, notes };
}

export function normalizeBuilderLikeModelOutput(raw: unknown): NormalizedModelOutput {
  if (!raw || typeof raw !== "object") {
    return { payload: raw, notes: [] };
  }

  const payload = { ...(raw as Record<string, unknown>) };
  const rawEdits = Array.isArray(payload.edits) ? payload.edits : [];
  if (!Array.isArray(payload.edits)) {
    return { payload, notes: [] };
  }

  const nextEdits: Record<string, unknown>[] = [];
  const notes: string[] = [];

  rawEdits.forEach((edit, index) => {
    const normalized = normalizeEditItem(edit, index);
    if (normalized.next) {
      nextEdits.push(normalized.next);
    }
    notes.push(...normalized.notes);
  });

  payload.edits = nextEdits;
  return { payload, notes };
}
