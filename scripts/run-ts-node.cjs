const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const [entrypoint, ...args] = process.argv.slice(2);
const tsNodeBin = join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "ts-node.cmd" : "ts-node");

if (!entrypoint) {
  console.error("Missing TypeScript entrypoint.");
  process.exit(1);
}

if (!existsSync(tsNodeBin)) {
  console.error(
    [
      "This command needs TypeScript tooling dependencies that are not installed in the production app container.",
      "",
      "Run the Docker tooling service from the host instead:",
      "  docker compose --profile tools run --rm migrate-fresh",
      "  docker compose --profile tools run --rm migrate-fresh-seed",
      "",
      "For local development, run npm install first.",
    ].join("\n"),
  );
  process.exit(127);
}

const result = spawnSync(tsNodeBin, ["-r", "tsconfig-paths/register", entrypoint, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    TS_NODE_PROJECT: process.env.TS_NODE_PROJECT ?? "tsconfig.typeorm.json",
  },
});

process.exit(result.status ?? 1);
