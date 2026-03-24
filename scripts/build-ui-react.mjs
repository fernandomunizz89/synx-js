import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const entry = path.join(repoRoot, "src/lib/ui/react-task-assistant/index.tsx");
const outfile = path.join(repoRoot, "dist/ui-assets/task-assistant.react.js");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  target: ["es2020"],
  sourcemap: false,
  minify: true,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": "\"production\"",
  },
  logLevel: "info",
  legalComments: "none",
});
