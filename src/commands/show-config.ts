import { Command } from "commander";
import { loadGlobalConfig, loadLocalProjectConfig, loadResolvedProjectConfig } from "../lib/config.js";

export const showConfigCommand = new Command("show-config")
  .description("Show global, local, and resolved config")
  .action(async () => {
    const globalConfig = await loadGlobalConfig();
    const localConfig = await loadLocalProjectConfig();
    const resolvedConfig = await loadResolvedProjectConfig();

    console.log("\nGlobal config");
    console.log(JSON.stringify(globalConfig, null, 2));
    console.log("\nLocal project config");
    console.log(JSON.stringify(localConfig, null, 2));
    console.log("\nResolved config");
    console.log(JSON.stringify(resolvedConfig, null, 2));
  });
