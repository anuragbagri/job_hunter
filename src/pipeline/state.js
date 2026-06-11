import { Annotation } from "@langchain/langgraph";

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {string} fullName
 * @property {string} email
 * @property {string=} phone
 * @property {string=} location
 * @property {string=} linkedinUrl
 * @property {string=} githubUrl
 * @property {string=} portfolioUrl
 * @property {string[]} targetRoles
 * @property {string[]} targetLocations
 * @property {string[]} skills
 * @property {string=} experienceSummary
 * @property {string=} resumePath
 * @property {string} resumeText
 */

/**
 * @typedef {Object} RawJobListing
 * @property {string} platform
 * @property {string} externalId
 * @property {string} url
 * @property {string} title
 * @property {string} company
 * @property {string=} location
 * @property {string=} description
 * @property {string=} applyUrl
 * @property {string=} applyEmail
 * @property {Date|string|null=} postedAt
 */

/**
 * @typedef {RawJobListing & {
 *   discoveredAt: Date,
 *   rawData?: Record<string, unknown>
 * }} JobListing
 */

/**
 * @typedef {JobListing & {
 *   matchScore: number,
 *   tailoringLevel: "none" | "light" | "full",
 *   strategy: "easy_apply" | "form_fill" | "email" | "manual_download",
 *   reasoning?: string,
 *   coverLetterText?: string,
 *   resumeSummary?: string
 * }} ScoredJobListing
 */

/**
 * @typedef {Object} ApplicationResult
 * @property {string} jobId
 * @property {"applied" | "failed" | "manual_pending"} status
 * @property {"easy_apply" | "form_fill" | "email" | "manual_download"} strategy
 * @property {number} matchScore
 * @property {"none" | "light" | "full"} tailoringLevel
 * @property {string=} coverLetterText
 * @property {string=} resumeSummary
 * @property {string=} errorMessage
 * @property {ScoredJobListing=} listing
 */

/**
 * @typedef {Object} RunMetadata
 * @property {string} runId
 * @property {Date|string} startedAt
 * @property {number} jobsDiscovered
 * @property {number} jobsMatched
 * @property {number=} jobsSkipped
 * @property {number} jobsApplied
 * @property {number} jobsFailed
 */

/**
 * @typedef {Object} JobHunterState
 * @property {CandidateProfile|null} candidateProfile
 * @property {string=} platform
 * @property {string[]} enabledPlatforms
 * @property {RawJobListing[]} rawListings
 * @property {JobListing[]} dedupedListings
 * @property {ScoredJobListing[]} scoredListings
 * @property {ScoredJobListing|null} currentListing
 * @property {ApplicationResult[]} applications
 * @property {RunMetadata|null} runMetadata
 */

const appendArray = (current = [], update = []) => {
  if (!Array.isArray(update)) return current ?? [];
  return [...(current ?? []), ...update];
};

const replaceArray = (_current = [], update = []) => {
  if (!Array.isArray(update)) return [];
  return update;
};

const replaceValue = (_current, update) => update;

const mergeObject = (current = null, update = null) => ({
  ...(current ?? {}),
  ...(update ?? {})
});

export const JobHunterAnnotation = Annotation.Root({
  candidateProfile: Annotation({
    reducer: replaceValue,
    default: () => null
  }),
  platform: Annotation({
    reducer: replaceValue,
    default: () => undefined
  }),
  enabledPlatforms: Annotation({
    reducer: replaceArray,
    default: () => []
  }),
  rawListings: Annotation({
    reducer: appendArray,
    default: () => []
  }),
  dedupedListings: Annotation({
    reducer: replaceArray,
    default: () => []
  }),
  scoredListings: Annotation({
    reducer: replaceArray,
    default: () => []
  }),
  currentListing: Annotation({
    reducer: replaceValue,
    default: () => null
  }),
  applications: Annotation({
    reducer: appendArray,
    default: () => []
  }),
  runMetadata: Annotation({
    reducer: mergeObject,
    default: () => null
  })
});
