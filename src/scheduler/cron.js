import cron from "node-cron";
import { browserManager } from "../browser/browserManager.js";
import { config } from "../config/index.js";
import { run } from "../pipeline/runner.js";

let task;
let running = false;

export function start() {
  if (task) return task;

  task = cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      if (running) {
        console.warn("[scheduler] Previous run is still active; skipping this tick.");
        return;
      }

      running = true;
      try {
        await run();
      } catch (error) {
        console.error("[scheduler] Pipeline run failed:", error.message);
      } finally {
        running = false;
      }
    },
    { scheduled: false }
  );

  task.start();
  registerShutdownHandlers();
  return task;
}

function registerShutdownHandlers() {
  const shutdown = async (signal) => {
    console.log(`[scheduler] Received ${signal}; shutting down.`);
    task?.stop();
    await browserManager.close();
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
