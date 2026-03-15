export interface DiscoveredModelMatch {
  matchedModel: string;
  exact: boolean;
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase();
}

function stripModelTag(value: string): string {
  const normalized = normalizeModelId(value);
  if (!normalized) return "";
  const slashIndex = normalized.lastIndexOf("/");
  const colonIndex = normalized.lastIndexOf(":");
  if (colonIndex > slashIndex) return normalized.slice(0, colonIndex);
  return normalized;
}

function canonicalizeModelAlias(value: string): string {
  return stripModelTag(value);
}

function modelLeaf(value: string): string {
  const lastSlashIndex = value.lastIndexOf("/");
  if (lastSlashIndex < 0) return value;
  return value.slice(lastSlashIndex + 1);
}

export function modelsLikelyMatch(requestedModel: string, discoveredModel: string): boolean {
  const requested = canonicalizeModelAlias(requestedModel);
  const discovered = canonicalizeModelAlias(discoveredModel);
  if (!requested || !discovered) return false;
  if (requested === discovered) return true;

  const requestedHasNamespace = requested.includes("/");
  const discoveredHasNamespace = discovered.includes("/");
  if (requestedHasNamespace && discoveredHasNamespace) return false;

  return modelLeaf(requested) === modelLeaf(discovered);
}

export function findDiscoveredModelMatch(
  requestedModel: string,
  discoveredModels: string[],
): DiscoveredModelMatch | null {
  const requested = normalizeModelId(requestedModel);
  if (!requested || !discoveredModels.length) return null;

  const exact = discoveredModels.find((item) => normalizeModelId(item) === requested);
  if (exact) return { matchedModel: exact, exact: true };

  const loose = discoveredModels.find((item) => modelsLikelyMatch(requestedModel, item));
  if (!loose) return null;
  return { matchedModel: loose, exact: false };
}

export function choosePreferredDiscoveredModel(discoveredModels: string[], preferredModel?: string): string {
  if (!discoveredModels.length) {
    return (preferredModel || "").trim();
  }

  const candidates = [
    (preferredModel || "").trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = findDiscoveredModelMatch(candidate, discoveredModels);
    if (match?.matchedModel) return match.matchedModel;
  }

  return discoveredModels[0];
}
