import { config } from "./config/index.js";
import { start } from "./scheduler/cron.js";

const task = start();
const nextRun = typeof task.getNextRun === "function" ? task.getNextRun() : null;

console.log(
  `Job hunter scheduler started. Schedule: ${config.CRON_SCHEDULE}. Next scheduled run: ${
    nextRun ? nextRun.toISOString() : config.CRON_SCHEDULE
  }`
);
