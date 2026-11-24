import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const port = process.env.API_PORT || "8010";
const candidates = [process.env.PYTHON, "py", "python3", "python"].filter(
  Boolean,
);

const python = candidates.find((candidate) => {
  const result = spawnSync(candidate, ["--version"], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  return result.status === 0;
});

if (!python) {
  console.error(
    "Python 3.11+ was not found. Set the PYTHON environment variable or install Python.",
  );
  process.exit(1);
}

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "backend.server:app",
    "--host",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (error) => {
  console.error(`Failed to start the API: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
