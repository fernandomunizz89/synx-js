import path from "node:path";
import { ensureDir, exists, readJson, writeJson } from "./fs.js";
import { runtimeDir } from "./paths.js";
import { nowIso } from "./utils.js";

export interface ReleaseStateEvent {
  at: string;
  event: "stabilization_started" | "incident_recorded" | "stabilization_updated" | "stabilization_closed";
  taskId?: string;
  summary?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface ReleaseState {
  version: 1;
  stabilization: {
    active: boolean;
    startedAt?: string;
    endsAt?: string;
    releaseTaskId?: string;
    summary?: string;
    incidents: number;
    focusAreas: string[];
    updatedAt: string;
  };
  history: ReleaseStateEvent[];
}

const RELEASE_STATE_FILE = "release-state.json";

function releaseStatePath(): string {
  return path.join(runtimeDir(), RELEASE_STATE_FILE);
}

function createDefaultReleaseState(): ReleaseState {
  return {
    version: 1,
    stabilization: {
      active: false,
      incidents: 0,
      focusAreas: [],
      updatedAt: nowIso(),
    },
    history: [],
  };
}

export async function loadReleaseState(): Promise<ReleaseState> {
  const target = releaseStatePath();
  if (!(await exists(target))) return createDefaultReleaseState();
  try {
    const parsed = await readJson<ReleaseState>(target);
    if (parsed?.version === 1 && parsed.stabilization) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return createDefaultReleaseState();
}

export async function saveReleaseState(state: ReleaseState): Promise<void> {
  await ensureDir(runtimeDir());
  await writeJson(releaseStatePath(), state);
}

export async function activateStabilizationMode(args: {
  taskId: string;
  summary: string;
  focusAreas?: string[];
  windowHours?: number;
}): Promise<ReleaseState> {
  const state = await loadReleaseState();
  const now = nowIso();
  const windowHours = Math.max(1, Math.floor(args.windowHours ?? 24));
  const endsAt = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();
  state.stabilization = {
    active: true,
    startedAt: now,
    endsAt,
    releaseTaskId: args.taskId,
    summary: args.summary.trim(),
    incidents: state.stabilization.incidents || 0,
    focusAreas: (args.focusAreas || []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    updatedAt: now,
  };
  state.history = [
    ...state.history.slice(-39),
    { at: now, event: "stabilization_started", taskId: args.taskId, summary: args.summary.trim() },
  ];
  await saveReleaseState(state);
  return state;
}

export async function recordReleaseIncident(args: {
  taskId: string;
  summary: string;
  severity?: "low" | "medium" | "high" | "critical";
  focusAreas?: string[];
}): Promise<ReleaseState> {
  const state = await loadReleaseState();
  const now = nowIso();
  const additionalFocus = (args.focusAreas || []).map((item) => item.trim()).filter(Boolean);
  state.stabilization.active = true;
  state.stabilization.incidents = Math.max(0, state.stabilization.incidents || 0) + 1;
  state.stabilization.updatedAt = now;
  state.stabilization.focusAreas = Array.from(new Set([...(state.stabilization.focusAreas || []), ...additionalFocus])).slice(0, 10);
  state.history = [
    ...state.history.slice(-39),
    {
      at: now,
      event: "incident_recorded",
      taskId: args.taskId,
      summary: args.summary.trim(),
      severity: args.severity || "high",
    },
  ];
  await saveReleaseState(state);
  return state;
}

export async function updateStabilizationFocus(args: {
  taskId: string;
  summary: string;
  focusAreas: string[];
}): Promise<ReleaseState> {
  const state = await loadReleaseState();
  const now = nowIso();
  state.stabilization.active = true;
  state.stabilization.updatedAt = now;
  state.stabilization.summary = args.summary.trim();
  state.stabilization.releaseTaskId = args.taskId;
  state.stabilization.focusAreas = Array.from(new Set(args.focusAreas.map((item) => item.trim()).filter(Boolean))).slice(0, 10);
  state.history = [
    ...state.history.slice(-39),
    { at: now, event: "stabilization_updated", taskId: args.taskId, summary: args.summary.trim() },
  ];
  await saveReleaseState(state);
  return state;
}
