import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  discoverModels,
  fetchUiConfig,
  saveSetup,
  type ProviderType,
  type SaveSetupInput,
} from "../api/setup.js";

const PROVIDERS: ProviderType[] = ["openai-compatible", "google", "anthropic", "lmstudio", "mock"];
const AGENTS = [
  "Synx Front Expert",
  "Synx Mobile Expert",
  "Synx Back Expert",
  "Synx QA Engineer",
  "Synx SEO Specialist",
] as const;

interface AgentState {
  providerType: ProviderType;
  model: string;
}

function selectStyle(): React.CSSProperties {
  return {
    background: "var(--bg3)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--fg)",
    fontSize: 13,
    padding: "8px 10px",
    minWidth: 180,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--bg3)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--fg)",
    fontSize: 13,
    padding: "8px 10px",
    minWidth: 260,
  };
}

function modelOptionsForProvider(providerType: ProviderType, modelsByProvider: Record<string, string[]>): string[] {
  if (providerType === "mock") return ["mock-dispatcher-v1"];
  return modelsByProvider[providerType] || [];
}

function modelOptionsWithCurrent(
  providerType: ProviderType,
  modelsByProvider: Record<string, string[]>,
  currentModel: string,
): string[] {
  const base = modelOptionsForProvider(providerType, modelsByProvider);
  if (!currentModel.trim()) return base;
  if (base.includes(currentModel)) return base;
  return [currentModel, ...base];
}

export function SetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [humanReviewer, setHumanReviewer] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openai-compatible");
  const [model, setModel] = useState("");
  const [plannerSeparate, setPlannerSeparate] = useState(true);
  const [plannerProviderType, setPlannerProviderType] = useState<ProviderType>("openai-compatible");
  const [plannerModel, setPlannerModel] = useState("");
  const [agentState, setAgentState] = useState<Record<string, AgentState>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  const [discoveryErrorByProvider, setDiscoveryErrorByProvider] = useState<Record<string, string>>({});
  const discoveryAttemptedRef = useRef<Record<string, boolean>>({});
  const discoveryInFlightRef = useRef<Record<string, boolean>>({});

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchUiConfig();
      const global = cfg.global;
      const local = cfg.local;

      const nextProviderType = global?.providers?.dispatcher?.type ?? "openai-compatible";
      const nextModel = global?.providers?.dispatcher?.model ?? "";
      const nextPlannerType = global?.providers?.planner?.type ?? nextProviderType;
      const nextPlannerModel = global?.providers?.planner?.model ?? nextModel;

      setHumanReviewer(local?.humanReviewer ?? global?.defaults?.humanReviewer ?? "");
      setProviderType(nextProviderType);
      setModel(nextModel);
      setPlannerProviderType(nextPlannerType);
      setPlannerModel(nextPlannerModel);
      setPlannerSeparate(true);

      const nextAgentState: Record<string, AgentState> = {};
      for (const agentName of AGENTS) {
        const existing = global?.agentProviders?.[agentName];
        nextAgentState[agentName] = {
          providerType: existing?.type ?? nextProviderType,
          model: existing?.model ?? nextModel,
        };
      }
      setAgentState(nextAgentState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  const discover = useCallback(async (pType: ProviderType, force = false) => {
    if (pType === "mock") return;
    if (discoveryInFlightRef.current[pType]) return;
    if (!force && discoveryAttemptedRef.current[pType]) return;
    discoveryInFlightRef.current[pType] = true;
    discoveryAttemptedRef.current[pType] = true;
    try {
      const data = await discoverModels(pType);
      setModelsByProvider((prev) => ({ ...prev, [pType]: data.models || [] }));
      const nextMessage = !data.reachable
        ? (data.message || "Provider is unreachable.")
        : (data.models?.length ? "" : (data.message || "Provider returned no models."));
      setDiscoveryErrorByProvider((prev) => ({ ...prev, [pType]: nextMessage }));
    } catch (error) {
      setDiscoveryErrorByProvider((prev) => ({
        ...prev,
        [pType]: error instanceof Error && error.message
          ? error.message
          : "Could not load model list for this provider. You can type the model manually.",
      }));
    } finally {
      discoveryInFlightRef.current[pType] = false;
    }
  }, []);

  useEffect(() => { void discover(providerType); }, [discover, providerType]);
  useEffect(() => { void discover(plannerProviderType); }, [discover, plannerProviderType]);
  useEffect(() => {
    const uniqueProviders = new Set<ProviderType>([providerType, plannerProviderType]);
    for (const agentName of AGENTS) {
      const pType = agentState[agentName]?.providerType;
      if (pType) uniqueProviders.add(pType);
    }
    for (const pType of uniqueProviders) {
      if (pType !== "mock") void discover(pType);
    }
  }, [agentState, discover, plannerProviderType, providerType]);

  const canSave = useMemo(() => {
    if (!humanReviewer.trim()) return false;
    if (providerType !== "mock" && !model.trim()) return false;
    if (plannerSeparate && plannerProviderType !== "mock" && !plannerModel.trim()) return false;
    for (const agentName of AGENTS) {
      const row = agentState[agentName];
      if (!row) return false;
      if (row.providerType !== "mock" && !row.model.trim()) return false;
    }
    return true;
  }, [agentState, humanReviewer, model, plannerModel, plannerProviderType, plannerSeparate, providerType]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: SaveSetupInput = {
        humanReviewer: humanReviewer.trim(),
        providerType,
        model: model.trim(),
        plannerSeparate,
        plannerProviderType,
        plannerModel: plannerModel.trim(),
        agentProviders: AGENTS.map((agentName) => ({
          agentName,
          providerType: agentState[agentName]?.providerType ?? providerType,
          model: (agentState[agentName]?.model ?? "").trim(),
        })),
      };
      await saveSetup(payload);
      setMessage("Setup saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save setup.");
    } finally {
      setSaving(false);
    }
  }, [agentState, humanReviewer, model, plannerModel, plannerProviderType, plannerSeparate, providerType]);

  if (loading) {
    return <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>Loading setup...</div>;
  }

  return (
    <section style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Provider Setup</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>Human reviewer</label>
        <input value={humanReviewer} onChange={(e) => setHumanReviewer(e.target.value)} style={inputStyle()} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>Dispatcher provider</label>
        <select
          value={providerType}
          onChange={(e) => {
            const nextType = e.target.value as ProviderType;
            setProviderType(nextType);
            setModel(nextType === "mock" ? "mock-dispatcher-v1" : "");
          }}
          style={selectStyle()}
        >
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={inputStyle()}
          list={`models-dispatcher-${providerType}`}
          placeholder={providerType === "mock" ? "mock-dispatcher-v1" : "model id (e.g. gpt-5.4)"}
        >
        </input>
        <datalist id={`models-dispatcher-${providerType}`}>
          {modelOptionsWithCurrent(providerType, modelsByProvider, model).map((m) => <option key={m} value={m} />)}
        </datalist>
        <button type="button" onClick={() => void discover(providerType, true)} style={selectStyle()}>
          Refresh models
        </button>
      </div>
      {discoveryErrorByProvider[providerType] && (
        <div style={{ color: "var(--orange)", fontSize: 12 }}>{discoveryErrorByProvider[providerType]}</div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
          <input type="checkbox" checked={plannerSeparate} onChange={(e) => setPlannerSeparate(e.target.checked)} />
          Configure planner separately
        </label>
        {plannerSeparate && (
          <>
            <select
              value={plannerProviderType}
              onChange={(e) => {
                const nextType = e.target.value as ProviderType;
                setPlannerProviderType(nextType);
                setPlannerModel(nextType === "mock" ? "mock-dispatcher-v1" : "");
              }}
              style={selectStyle()}
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              value={plannerModel}
              onChange={(e) => setPlannerModel(e.target.value)}
              style={inputStyle()}
              list={`models-planner-${plannerProviderType}`}
              placeholder={plannerProviderType === "mock" ? "mock-dispatcher-v1" : "planner model id"}
            >
            </input>
            <datalist id={`models-planner-${plannerProviderType}`}>
              {modelOptionsWithCurrent(plannerProviderType, modelsByProvider, plannerModel).map((m) => <option key={m} value={m} />)}
            </datalist>
            <button type="button" onClick={() => void discover(plannerProviderType, true)} style={selectStyle()}>
              Refresh models
            </button>
          </>
        )}
      </div>
      {plannerSeparate && discoveryErrorByProvider[plannerProviderType] && (
        <div style={{ color: "var(--orange)", fontSize: 12 }}>{discoveryErrorByProvider[plannerProviderType]}</div>
      )}

      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", fontSize: 12, color: "var(--muted)" }}>
          Per-agent provider
        </div>
        {AGENTS.map((agentName) => {
          const row = agentState[agentName] ?? { providerType, model };
          return (
            <div
              key={agentName}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ width: 170, fontSize: 12 }}>{agentName}</div>
              <select
                value={row.providerType}
                onChange={(e) => setAgentState((prev) => ({
                  ...prev,
                  [agentName]: {
                    ...row,
                    providerType: e.target.value as ProviderType,
                    model: (e.target.value as ProviderType) === "mock" ? "mock-dispatcher-v1" : "",
                  },
                }))}
                style={selectStyle()}
              >
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                value={row.model}
                onChange={(e) => setAgentState((prev) => ({
                  ...prev,
                  [agentName]: { ...row, model: e.target.value },
                }))}
                style={inputStyle()}
                list={`models-agent-${agentName}-${row.providerType}`}
                placeholder={row.providerType === "mock" ? "mock-dispatcher-v1" : "agent model id"}
              >
              </input>
              <datalist id={`models-agent-${agentName}-${row.providerType}`}>
                {modelOptionsWithCurrent(row.providerType, modelsByProvider, row.model).map((m) => <option key={m} value={m} />)}
              </datalist>
              <button type="button" onClick={() => void discover(row.providerType, true)} style={selectStyle()}>
                Refresh models
              </button>
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
      {message && <div style={{ color: "var(--green)", fontSize: 12 }}>{message}</div>}

      <div>
        <button
          onClick={() => void onSave()}
          disabled={!canSave || saving}
          style={{
            background: "var(--teal-dim)",
            border: "1px solid var(--teal)55",
            color: "var(--teal)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: !canSave || saving ? "default" : "pointer",
            opacity: !canSave || saving ? 0.65 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Setup"}
        </button>
      </div>
    </section>
  );
}
