import { DispatcherWorker } from "./dispatcher.js";
import { PlannerWorker } from "./planner.js";
import { BugInvestigatorWorker } from "./bug-investigator.js";
import { BugFixerWorker } from "./bug-fixer.js";
import { BuilderWorker } from "./builder.js";
import { ReviewerWorker } from "./reviewer.js";
import { QaWorker } from "./qa.js";
import { PrWriterWorker } from "./pr-writer.js";

export const workers = [
  new DispatcherWorker(),
  new PlannerWorker(),
  new BugInvestigatorWorker(),
  new BugFixerWorker(),
  new BuilderWorker(),
  new ReviewerWorker(),
  new QaWorker(),
  new PrWriterWorker(),
];
