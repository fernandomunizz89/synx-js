export function providerErrorToHuman(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("could not extract json")) {
    return "The model answered in a format the pipeline could not understand. Try a stricter prompt, another model, or rerun the task.";
  }

  if (lower.includes("missing base url env") || lower.includes("missing provider base url")) {
    return "Provider base URL is missing. Run setup and save the connection details, or set the expected environment variable in this terminal.";
  }

  if (lower.includes("missing api key env")) {
    return "The provider API key is missing. If you are using a local provider without auth, use a dummy value or override the provider config.";
  }

  if (lower.includes("failed with 429") || lower.includes("quota")) {
    return "The provider refused the request because quota or billing is not available.";
  }

  if (lower.includes("fetch failed") || lower.includes("econnrefused")) {
    return "The provider could not be reached. If you use LM Studio, make sure its local server is running.";
  }

  return message;
}

export function providerHealthToHuman(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("missing environment variable") || lower.includes("missing provider base url")) {
    return `${message} Fix now: run setup and choose a saved connection, or define the variable in this terminal and retry.`;
  }

  if (lower.includes("provider answered with 401") || lower.includes("provider answered with 403")) {
    return "The provider rejected authentication. Fix now: check API key value and endpoint URL, then validate again.";
  }

  if (lower.includes("provider answered with 404")) {
    return "The provider endpoint was found, but the API path is invalid. Fix now: confirm base URL ends with /v1.";
  }

  if (lower.includes("provider answered with 429")) {
    return "The provider is reachable, but rate limits or quota are blocking requests. Fix now: wait/retry or use another provider/model.";
  }

  if (lower.includes("returned no models")) {
    return "Provider is reachable but returned no models. Fix now: load at least one model in the provider and retry setup.";
  }

  if (lower.includes("configured model was not found")) {
    return "Provider is reachable, but selected model was not found. Fix now: choose a model from the discovered list.";
  }

  if (lower.includes("econnrefused") || lower.includes("fetch failed")) {
    return "The provider server could not be reached. Fix now: start LM Studio server, confirm URL/port, then retry.";
  }

  return message;
}
