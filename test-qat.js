import { SynxQAEngineer } from "./src/workers/experts/synx-qa-engineer.js";
import { createTask } from "./src/lib/task.js";
import path from "node:path";
import { writeJson } from "./src/lib/fs.js";


async function run() {
  const task = await createTask({
    title: "Dark mode toggle",
    typeHint: "Feature",
    project: "test-app",
    rawRequest: "Verify dark mode toggle works correctly",
    extraContext: { relatedFiles: [], logs: [], notes: [] },
  });
  const inboxPath = path.join(task.taskPath, "inbox", "04b-synx-qa-engineer.request.json");
  await writeJson(inboxPath, {
    taskId: task.taskId,
    stage: "synx-qa-engineer",
    status: "request",
    createdAt: new Date().toISOString(),
    agent: "Synx QA Engineer",
  });
  const qa = new SynxQAEngineer();
  try {
    await qa.tryProcess(task.taskId);
  } catch(e) { console.error("BOOM", e); }
}
run();
