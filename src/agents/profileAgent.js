import fs from "node:fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { config } from "../config/index.js";
import { prisma } from "../db/client.js";

export async function profileAgent(state) {
  const profile = await prisma.userProfile.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (!profile) {
    throw new Error("No UserProfile record found. Create one before running the job hunter pipeline.");
  }

  const resumePath = profile.resumePath || config.RESUME_PATH;
  const resumeBuffer = await fs.readFile(resumePath);
  const parsedResume = await pdfParse(resumeBuffer);

  return {
    candidateProfile: {
      ...profile,
      resumePath,
      resumeText: parsedResume.text
    }
  };
}
