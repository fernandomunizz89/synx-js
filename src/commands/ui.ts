import { Command } from "commander";
import { ensureGlobalInitialized, ensureProjectInitialized } from "../lib/bootstrap.js";
import { startUiServer } from "../lib/ui/server.js";
import { buildWebUiHtml } from "../lib/ui/web-app.js";

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid --port value "${value}". Use a valid TCP port between 1 and 65535.`);
  }
  return parsed;
}

export const uiCommand = new Command("ui")
  .description("Start local web UI for observability and human review")
  .option("--host <host>", "host bind address", "127.0.0.1")
  .option("--port <port>", "port number", parsePort, 4317)
  .option("--enable-actions", "enable approve/reprove/cancel API actions", false)
  .action(async (options: { host: string; port: number; enableActions?: boolean }) => {
    await ensureGlobalInitialized();
    await ensureProjectInitialized();

    const started = await startUiServer({
      host: options.host,
      port: options.port,
      html: buildWebUiHtml(),
      enableMutations: Boolean(options.enableActions),
    });

    console.log(`\nSYNX Web UI running at ${started.baseUrl}`);
    console.log(`- Read-only mode: ${options.enableActions ? "off (actions enabled)" : "on"}`);
    console.log("- Press Ctrl+C to stop.");

    await new Promise<void>((resolve) => {
      const stop = async () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        await started.close();
        resolve();
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
  });
