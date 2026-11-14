import { spawn, spawnSync } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
const vite = spawn(
  process.execPath,
  ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
  },
);

async function waitUntilReady() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early with code ${vite.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the E2E frontend server");
}

function stopServerTree() {
  if (!vite.pid || vite.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(vite.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    vite.kill("SIGTERM");
  }
}

let exitCode = 1;
try {
  await waitUntilReady();
  const playwright = spawn(process.execPath, ["./node_modules/@playwright/test/cli.js", "test"], {
    stdio: "inherit",
    env: { ...process.env, E2E_BASE_URL: baseUrl },
  });
  exitCode = await new Promise((resolve, reject) => {
    playwright.once("error", reject);
    playwright.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  stopServerTree();
}

process.exit(exitCode);
