/**
 * Evaluates a JS-like condition expression against a step's output object.
 *
 * The expression runs with `output` as its only in-scope variable. Any expression
 * that throws (TypeError from a missing nested key, syntax error, explicit throw,
 * etc.) safely returns false — routing falls through to the next candidate or the
 * defaultNextStep instead of crashing the pipeline.
 *
 * Note: This is not a sandboxed evaluator. It runs in the Node global scope.
 * Only use with pipeline definition files authored by trusted users in your repo.
 *
 * Example expressions:
 *   "output.type === 'bug'"
 *   "output.score > 80"
 *   "output.type === 'bug' && output.severity === 'high'"
 *   "output.filesChanged && output.filesChanged.length > 0"
 */
export function evaluateCondition(
  expression: string,
  output: Record<string, unknown>,
): boolean {
  if (!expression.trim()) return false;
  try {
    // new Function gives us `output` as the only in-scope variable.
    // eslint-disable-next-line no-new-func
    const fn = new Function("output", `"use strict"; return !!(${expression});`);
    return fn(output) === true;
  } catch {
    return false;
  }
}
