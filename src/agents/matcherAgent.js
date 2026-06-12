import { z } from "zod";
import { config } from "../config/index.js";
import { createChatModel } from "../llm/client.js";

const matchSchema = z.object({
  score: z.number().min(0).max(100),
  tailoringLevel: z.enum(["none", "light", "full"]),
  strategy: z.enum(["easy_apply", "form_fill", "email", "manual_download"]),
  reasoning: z.string()
});

const model = createChatModel({ temperature: 0 }).withStructuredOutput(matchSchema);

const STRONG_MATCH_THRESHOLD = 85;
const MAX_MODEL_ATTEMPTS = 3;

export async function matcherAgent(state) {
  const listings = (state.dedupedListings ?? []).slice(0, Math.max(0, config.MAX_LISTINGS_PER_RUN));
  const scoredListings = [];
  let jobsSkipped = 0;

  for (const listing of listings) {
    const result = await invokeModelWithRetry(() => model.invoke(buildPrompt(state.candidateProfile, listing)));

    if (!result.ok) {
      jobsSkipped += 1;
      console.warn(`[matcher] Skipping ${listing.url}: ${errorMessage(result.error)}`);
      continue;
    }

    const analysis = result.value;
    const score = Math.round(Math.max(0, Math.min(100, analysis.score)));

    if (score < config.MATCH_THRESHOLD) {
      continue;
    }

    scoredListings.push({
      ...listing,
      matchScore: score,
      tailoringLevel: analysis.tailoringLevel,
      strategy: chooseStrategy(listing, analysis.strategy, score),
      reasoning: analysis.reasoning
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
  return `You are matching a candidate to a job.

Candidate:
Name: ${profile.fullName}
Location: ${profile.location ?? "Not specified"}
Target roles: ${(profile.targetRoles ?? []).join(", ")}
Target locations: ${(profile.targetLocations ?? []).join(", ")}
Skills: ${(profile.skills ?? []).join(", ")}
Experience summary: ${profile.experienceSummary ?? ""}
Resume text:
${profile.resumeText}

Job:
Platform: ${listing.platform}
Title: ${listing.title}
Company: ${listing.company}
Location: ${listing.location ?? "Not specified"}
Description:
${listing.description ?? ""}

Return a 0-100 match score, tailoring level, application strategy, and concise reasoning.`;
}

function chooseStrategy(listing, suggestedStrategy, score) {
  const searchableText = `${listing.title} ${listing.description} ${listing.url}`.toLowerCase();

  if (isLinkedInListing(listing) && !config.LINKEDIN_AUTO_APPLY_ENABLED) {
    return "manual_download";
  }

  if (score < STRONG_MATCH_THRESHOLD) {
    return "manual_download";
  }

  if (suggestedStrategy === "easy_apply" && isNativeEasyApply(listing, searchableText)) {
    return "easy_apply";
  }

  if (listing.applyEmail) {
    return "email";
  }

  if (suggestedStrategy === "manual_download") {
    return "manual_download";
  }

  if (hasUsableApplicationForm(listing)) {
    return "form_fill";
  }

  return "manual_download";
}

function isLinkedInListing(listing) {
  return String(listing.platform ?? "").toLowerCase() === "linkedin";
}

function isNativeEasyApply(listing, searchableText) {
  const platform = String(listing.platform ?? "").toLowerCase();
  const supportsNativeEasyApply =
    ["indeed", "naukri"].includes(platform) || (platform === "linkedin" && config.LINKEDIN_AUTO_APPLY_ENABLED);

  return supportsNativeEasyApply || searchableText.includes("easy apply");
}

function hasUsableApplicationForm(listing) {
  return Boolean(listing.applyUrl && listing.applyUrl !== listing.url);
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
