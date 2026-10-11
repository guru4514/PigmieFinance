// Compatibility entry point; all detection lives in the shared CI/index scanner.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "check-secrets.mjs"), "--staged"],
  { stdio: "inherit" },
);
if (result.error) console.error("Secret inspection could not start.");
process.exit(result.status ?? 1);
