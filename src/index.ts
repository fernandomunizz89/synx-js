#!/usr/bin/env node

import { Command } from "commander";
import { setupCommand } from "./commands/setup.js";
import { startCommand } from "./commands/start.js";
import { newCommand } from "./commands/new.js";
import { statusCommand } from "./commands/status.js";
import { approveCommand } from "./commands/approve.js";
import { doctorCommand } from "./commands/doctor.js";
import { resumeCommand } from "./commands/resume.js";
import { fixCommand } from "./commands/fix.js";
import { metricsCommand } from "./commands/metrics.js";
import { showConfigCommand } from "./commands/show-config.js";
import { cancelCommand } from "./commands/cancel.js";

const program = new Command();

program.name("synx").description("SYNX - Synthetic Agent Orchestrator v5").version("5.0.0");
program.addCommand(setupCommand);
program.addCommand(startCommand);
program.addCommand(newCommand);
program.addCommand(statusCommand);
program.addCommand(approveCommand);
program.addCommand(doctorCommand);
program.addCommand(resumeCommand);
program.addCommand(fixCommand);
program.addCommand(metricsCommand);
program.addCommand(showConfigCommand);
program.addCommand(cancelCommand);

program.parseAsync(process.argv).catch((error) => {
  console.error("\nError:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
