import { spawn, execSync, type ChildProcess } from "child_process";

let serverProcess: ChildProcess | undefined;

/**
 * Check if a server is responding at the given URL.
 */
export async function isServerReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    // Accept any response that isn't a server error
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Wait for a server to become ready, with retries.
 */
export async function waitForServer(
  url: string,
  maxWaitMs: number = 90000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerReady(url)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Start the dev server using the configured command.
 */
export function startDevServer(command: string, cwd: string): ChildProcess {
  // Kill any existing process on the target port first
  killProcessOnPort(3000);

  const [cmd, ...args] = command.split(" ");
  serverProcess = spawn(cmd, args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, PORT: "3000" },
    shell: true,
  });

  serverProcess.stdout?.on("data", () => {});
  serverProcess.stderr?.on("data", () => {});

  serverProcess.on("exit", () => {
    serverProcess = undefined;
  });

  return serverProcess;
}

/**
 * Stop the dev server if we started it.
 */
export function stopDevServer(): void {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      // ignore
    }
    serverProcess = undefined;
  }
  // Also kill anything on port 3000 as a safety net
  killProcessOnPort(3000);
}

/**
 * Kill any process listening on the given port.
 */
function killProcessOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti:${port} 2>/dev/null`, {
      encoding: "utf-8",
    }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try {
          process.kill(parseInt(pid), "SIGTERM");
        } catch {
          // ignore
        }
      }
      // Give processes time to die
      execSync("sleep 1");
    }
  } catch {
    // No process on port, that's fine
  }
}

/**
 * Ensure a dev server is running. If not, start it with the given command.
 */
export async function ensureDevServer(
  baseUrl: string,
  devCommand?: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  // First check if something is already running
  if (await isServerReady(baseUrl)) {
    return true;
  }

  if (!devCommand) {
    throw new Error(
      `No server running at ${baseUrl} and no devCommand configured. ` +
        `Either start your dev server manually or add devCommand to litmus.config.ts`
    );
  }

  // Kill any existing server that might be hung
  stopDevServer();
  await new Promise((r) => setTimeout(r, 2000));

  startDevServer(devCommand, cwd);
  const ready = await waitForServer(baseUrl);

  if (!ready) {
    stopDevServer();
    throw new Error(
      `Dev server failed to start within 90 seconds. Command: ${devCommand}`
    );
  }

  return true;
}
