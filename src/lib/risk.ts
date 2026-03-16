export type RiskLevel = "low" | "medium" | "high" | "unknown";

const RISK_LEVEL_SCORE: Record<RiskLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function normalizeRiskLevel(value: string | undefined): RiskLevel {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

export function raiseRisk(current: RiskLevel, candidate: RiskLevel): RiskLevel {
  return RISK_LEVEL_SCORE[candidate] > RISK_LEVEL_SCORE[current] ? candidate : current;
}
