import fs from "node:fs/promises";
import path from "node:path";

export async function manualDownloadAgent(state) {
  const listing = state.currentListing;

  try {
    const safeJobId = String(listing.externalId || listing.url).replace(/[^a-z0-9_-]+/gi, "_");
    const outputDir = path.join("./data/applications", safeJobId);
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(path.join(outputDir, "job.json"), JSON.stringify(listing, null, 2));
    await fs.writeFile(path.join(outputDir, "cover_letter.txt"), listing.coverLetterText ?? "");
    await fs.writeFile(path.join(outputDir, "resume_summary.txt"), listing.resumeSummary ?? "");

    return { applications: [buildResult(listing, "manual_pending")] };
  } catch (error) {
    console.error(`[manual_download] ${listing?.url} failed:`, error.message);
    return { applications: [buildResult(listing, "failed", error.message)] };
  }
}

function buildResult(listing, status, errorMessage) {
  return {
    jobId: listing.externalId,
    status,
    strategy: "manual_download",
    matchScore: listing.matchScore,
    tailoringLevel: listing.tailoringLevel,
    coverLetterText: listing.coverLetterText,
    resumeSummary: listing.resumeSummary,
    errorMessage,
    listing
  };
}
