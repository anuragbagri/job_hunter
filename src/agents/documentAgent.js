import { z } from "zod";
import { createChatModel } from "../llm/client.js";

const documentSchema = z.object({
  coverLetter: z.string().optional(),
  resumeSummary: z.string().optional()
});

const model = createChatModel({ temperature: 0.4 }).withStructuredOutput(documentSchema);

const MAX_MODEL_ATTEMPTS = 3;

export async function documentAgent(state) {
  const scoredListings = [];
  let jobsSkipped = 0;

  for (const listing of state.scoredListings ?? []) {
    if (listing.tailoringLevel === "none") {
      scoredListings.push(listing);
      continue;
    }

    const result = await invokeModelWithRetry(() => model.invoke(buildPrompt(state.candidateProfile, listing)));

    if (!result.ok) {
      jobsSkipped += 1;
      console.warn(`[document] Skipping ${listing.url}: ${errorMessage(result.error)}`);
      continue;
    }

    const documents = result.value;
    scoredListings.push({
      ...listing,
      coverLetterText: documents.coverLetter ?? listing.coverLetterText,
      resumeSummary:
        listing.tailoringLevel === "full"
          ? documents.resumeSummary ?? listing.resumeSummary
          : listing.resumeSummary
    });
  }

  return {
    scoredListings,
    runMetadata: {
      ...state.runMetadata,
      jobsMatched: scoredListings.length,
      jobsSkipped: (state.runMetadata?.jobsSkipped ?? 0) + jobsSkipped
    }
  };
}

function buildPrompt(profile, listing) {
  const needsResumeSummary = listing.tailoringLevel === "full";

  return `Create application documents for this candidate and job.

Candidate:
${profile.fullName}
${profile.email}
${profile.phone ?? ""}
${profile.location ?? ""}
Skills: ${(profile.skills ?? []).join(", ")}
Experience summary: ${profile.experienceSummary ?? ""}
Resume:
${profile.resumeText}

Job:
${listing.title} at ${listing.company}
${listing.description ?? ""}

Tailoring level: ${listing.tailoringLevel}
Generate ${needsResumeSummary ? "a concise cover letter and a tailored resume summary" : "a concise cover letter only"}.
Keep the tone direct and specific.`;
}

async function invokeModelWithRetry(operation) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error) || attempt === MAX_MODEL_ATTEMPTS) break;
      await delay(backoffForAttempt(attempt));
    }
  }

  return { ok: false, error: lastError };
}

function isRetryableModelError(error) {
  const status = error?.status ?? error?.response?.status;
  const code = error?.code ?? error?.cause?.code;
  const message = errorMessage(error);

  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  if (
    [
      "ABORT_ERR",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENETUNREACH",
      "ESOCKETTIMEDOUT",
      "UND_ERR_BODY_TIMEOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT"
    ].includes(code)
  ) {
    return true;
  }

  return /rate limit|too many requests|timeout|timed out|socket hang up|fetch failed|network error|temporarily unavailable/i.test(
    message
  );
}

function backoffForAttempt(attempt) {
  return 2 ** attempt * 1000;
}

function errorMessage(error) {
  return error?.message ?? String(error ?? "unknown error");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
