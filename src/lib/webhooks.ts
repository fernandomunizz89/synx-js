/**
 * Phase 5 — Webhook Delivery
 *
 * Delivers HTTP POST notifications when key task events occur.
 * Configuration is read from LocalProjectConfig.webhooks.
 */
import { loadResolvedProjectConfig } from "./config.js";
import { logDaemon } from "./logging.js";
import { nowIso } from "./utils.js";

export type WebhookEvent =
  | "task.created"
  | "task.approved"
  | "task.reproved"
  | "task.failed"
  | "task.review_required"
  | "task.cancel_requested";

export interface WebhookPayload {
  event: WebhookEvent;
  taskId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Deliver a webhook notification for a task event.
 * Best-effort: logs failures but never throws.
 */
export async function deliverWebhook(
  event: WebhookEvent,
  taskId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const config = await loadResolvedProjectConfig();
    const webhooks = (config as { webhooks?: { enabled?: boolean; url?: string; events?: string[] } }).webhooks;

    if (!webhooks?.enabled || !webhooks?.url) return;
    if (webhooks.events && webhooks.events.length > 0 && !webhooks.events.includes(event)) return;

    const payload: WebhookPayload = {
      event,
      taskId,
      timestamp: nowIso(),
      data,
    };

    const response = await fetch(webhooks.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Synx-Event": event,
        "X-Synx-Task-Id": taskId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      await logDaemon(`Webhook delivery failed: ${event} → ${webhooks.url} (HTTP ${response.status})`);
    }
  } catch (err) {
    await logDaemon(`Webhook delivery error: ${event} → ${String(err)}`).catch(() => {});
  }
}
