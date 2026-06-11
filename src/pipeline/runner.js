import nodemailer from "nodemailer";
import { pathToFileURL } from "node:url";
import { config } from "../config/index.js";
import { prisma } from "../db/client.js";
import { app } from "./graph.js";

export async function run() {
  const runLog = await prisma.runLog.create({
    data: {
      status: "running",
      startedAt: new Date()
    }
  });

  const initialState = {
    candidateProfile: null,
    platform: undefined,
    enabledPlatforms: [],
    rawListings: [],
    dedupedListings: [],
    scoredListings: [],
    currentListing: null,
    applications: [],
    runMetadata: {
      runId: runLog.id,
      startedAt: runLog.startedAt,
      jobsDiscovered: 0,
      jobsMatched: 0,
      jobsSkipped: 0,
      jobsApplied: 0,
      jobsFailed: 0
    }
  };

  try {
    const finalState = await app.invoke(initialState);
    const applications = finalState.applications ?? [];
    const jobsApplied = applications.filter((application) => application.status === "applied").length;
    const jobsFailed = applications.filter((application) => application.status === "failed").length;

    await prisma.runLog.update({
      where: { id: runLog.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        jobsDiscovered: finalState.runMetadata?.jobsDiscovered ?? finalState.rawListings?.length ?? 0,
        jobsMatched: finalState.scoredListings?.length ?? 0,
        jobsApplied,
        jobsFailed
      }
    });

    return finalState;
  } catch (error) {
    await prisma.runLog.update({
      where: { id: runLog.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error.message
      }
    });

    await sendErrorEmail(runLog.id, error).catch((emailError) => {
      console.error("[runner] Failed to send error email:", emailError.message);
    });

    throw error;
  }
}

async function sendErrorEmail(runId, error) {
  const transporter = nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    secure: config.EMAIL_SECURE,
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: config.EMAIL_FROM,
    to: config.EMAIL_TO,
    subject: `Job hunter run ${runId} failed`,
    text: `Run ${runId} failed.\n\n${error.stack ?? error.message}`
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}
