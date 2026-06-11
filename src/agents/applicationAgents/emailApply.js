import fs from "node:fs/promises";
import nodemailer from "nodemailer";
import { config } from "../../config/index.js";

export async function emailApplyAgent(state) {
  const listing = state.currentListing;

  try {
    if (!listing.applyEmail) {
      throw new Error("No application email found on listing");
    }

    const transporter = nodemailer.createTransport({
      host: config.EMAIL_HOST,
      port: config.EMAIL_PORT,
      secure: config.EMAIL_SECURE,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS
      }
    });

    const attachments = [];
    const resumePath = state.candidateProfile?.resumePath;
    if (await fileExists(resumePath)) {
      attachments.push({
        filename: "resume.pdf",
        path: resumePath
      });
    }

    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: listing.applyEmail,
      replyTo: state.candidateProfile.email,
      subject: `Application for ${listing.title}`,
      text: listing.coverLetterText || defaultBody(state.candidateProfile, listing),
      attachments
    });

    return { applications: [buildResult(listing, "applied")] };
  } catch (error) {
    console.error(`[email] ${listing?.url} failed:`, error.message);
    return { applications: [buildResult(listing, "failed", error.message)] };
  }
}

function defaultBody(profile, listing) {
  return `Hello,

I am applying for the ${listing.title} role at ${listing.company}. Please find my resume attached.

Regards,
${profile.fullName}`;
}

async function fileExists(filePath) {
  if (!filePath) return false;

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildResult(listing, status, errorMessage) {
  return {
    jobId: listing.externalId,
    status,
    strategy: "email",
    matchScore: listing.matchScore,
    tailoringLevel: listing.tailoringLevel,
    coverLetterText: listing.coverLetterText,
    resumeSummary: listing.resumeSummary,
    errorMessage,
    listing
  };
}
