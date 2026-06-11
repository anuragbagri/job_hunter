import { prisma } from "../db/client.js";

export async function trackerAgent(state) {
  const applications = state.applications ?? [];
  const profileId = state.candidateProfile?.id;
  const runLogId = state.runMetadata?.runId;

  for (const application of applications) {
    const listing = application.listing;
    if (!listing?.url) continue;

    const jobListing = await prisma.jobListing.findUnique({
      where: { url: listing.url },
      select: { id: true }
    });

    if (!jobListing) {
      console.warn(`[tracker] Skipping application for unknown listing ${listing.url}`);
      continue;
    }

    await prisma.application.create({
      data: {
        jobListingId: jobListing.id,
        userProfileId: profileId,
        runLogId,
        strategy: application.strategy,
        matchScore: application.matchScore,
        tailoringLevel: application.tailoringLevel,
        coverLetterText: application.coverLetterText || null,
        resumeSummary: application.resumeSummary || null,
        status: application.status,
        errorMessage: application.errorMessage || null
      }
    });
  }

  const jobsApplied = applications.filter((application) => application.status === "applied").length;
  const jobsFailed = applications.filter((application) => application.status === "failed").length;

  if (runLogId) {
    await prisma.runLog.update({
      where: { id: runLogId },
      data: {
        jobsDiscovered: state.runMetadata?.jobsDiscovered ?? 0,
        jobsMatched: state.scoredListings?.length ?? 0,
        jobsApplied,
        jobsFailed
      }
    });
  }

  return {
    applications: [],
    runMetadata: {
      ...state.runMetadata,
      jobsApplied,
      jobsFailed
    }
  };
}
