import { END, START, Send, StateGraph } from "@langchain/langgraph";
import { config } from "../config/index.js";
import { dedupAgent } from "../agents/dedupAgent.js";
import { documentAgent } from "../agents/documentAgent.js";
import { jobHunterAgent, routeScrapers } from "../agents/jobHunterAgent.js";
import { matcherAgent } from "../agents/matcherAgent.js";
import { notificationAgent } from "../agents/notificationAgent.js";
import { profileAgent } from "../agents/profileAgent.js";
import { trackerAgent } from "../agents/trackerAgent.js";
import { easyApplyAgent } from "../agents/applicationAgents/easyApply.js";
import { emailApplyAgent } from "../agents/applicationAgents/emailApply.js";
import { formFillAgent } from "../agents/applicationAgents/formFill.js";
import { manualDownloadAgent } from "../agents/applicationAgents/manualDownload.js";
import { scrape as scrapeHimalayas } from "../agents/scrapers/himalayas.js";
import { scrape as scrapeIndeed } from "../agents/scrapers/indeed.js";
import { scrape as scrapeLinkedIn } from "../agents/scrapers/linkedin.js";
import { scrape as scrapeMercor } from "../agents/scrapers/mercor.js";
import { scrape as scrapeNaukri } from "../agents/scrapers/naukri.js";
import { scrape as scrapeRemoteCo } from "../agents/scrapers/remoteCo.js";
import { scrape as scrapeRemoteOk } from "../agents/scrapers/remoteOk.js";
import { scrape as scrapeWeWorkRemotely } from "../agents/scrapers/weWorkRemotely.js";
import { JobHunterAnnotation } from "./state.js";

const scrapers = {
  remoteCo: scrapeRemoteCo,
  weWorkRemotely: scrapeWeWorkRemotely,
  mercor: scrapeMercor,
  remoteOk: scrapeRemoteOk,
  himalayas: scrapeHimalayas,
  linkedin: scrapeLinkedIn,
  indeed: scrapeIndeed,
  naukri: scrapeNaukri
};

async function scraperRouter(state) {
  const scraper = scrapers[state.platform];
  if (!scraper) {
    console.error(`[scraper_node] No scraper registered for platform ${state.platform}`);
    return { rawListings: [] };
  }

  return scraper(state);
}

async function applyRouterNode() {
  return {};
}

function routeApplications(state) {
  if ((state.scoredListings ?? []).length === 0) {
    return "tracker";
  }

  let linkedinAutoApplyCount = 0;

  return state.scoredListings.map((listing) => {
    const routedListing = applyPhaseGates(listing, linkedinAutoApplyCount);
    if (isLinkedInSubmittingBranch(routedListing)) {
      linkedinAutoApplyCount += 1;
    }

    const node = nodeForStrategy(routedListing.strategy);
    return new Send(node, {
      ...state,
      currentListing: routedListing,
      applications: []
    });
  });
}

function applyPhaseGates(listing, linkedinAutoApplyCount) {
  if (!config.AUTO_APPLY_ENABLED && isSubmittingStrategy(listing.strategy)) {
    return manualDownloadListing(listing, "auto_apply_disabled");
  }

  if (!isLinkedInListing(listing)) {
    return listing;
  }

  if (!config.LINKEDIN_AUTO_APPLY_ENABLED) {
    return manualDownloadListing(listing, "linkedin_auto_apply_disabled");
  }

  if (!isSubmittingStrategy(listing.strategy)) {
    return listing;
  }

  if (linkedinAutoApplyCount >= Math.max(0, config.LINKEDIN_AUTO_APPLY_RUN_CAP)) {
    return manualDownloadListing(listing, "linkedin_auto_apply_cap_reached");
  }

  return listing;
}

function manualDownloadListing(listing, phaseGateReason) {
  return {
    ...listing,
    strategy: "manual_download",
    phaseGateReason
  };
}

function isLinkedInListing(listing) {
  return String(listing.platform ?? "").toLowerCase() === "linkedin";
}

function isLinkedInSubmittingBranch(listing) {
  return isLinkedInListing(listing) && isSubmittingStrategy(listing.strategy);
}

function isSubmittingStrategy(strategy) {
  return ["easy_apply", "form_fill", "email"].includes(strategy);
}

function nodeForStrategy(strategy) {
  switch (strategy) {
    case "easy_apply":
      return "easy_apply";
    case "email":
      return "email_apply";
    case "manual_download":
      return "manual_download";
    case "form_fill":
    default:
      return "form_fill";
  }
}

const workflow = new StateGraph(JobHunterAnnotation)
  .addNode("profile", profileAgent)
  .addNode("job_hunter", jobHunterAgent)
  .addNode("scraper_node", scraperRouter)
  .addNode("dedup", dedupAgent)
  .addNode("matcher", matcherAgent)
  .addNode("document", documentAgent)
  .addNode("apply_router", applyRouterNode)
  .addNode("easy_apply", easyApplyAgent)
  .addNode("form_fill", formFillAgent)
  .addNode("email_apply", emailApplyAgent)
  .addNode("manual_download", manualDownloadAgent)
  .addNode("tracker", trackerAgent)
  .addNode("notification", notificationAgent)
  .addEdge(START, "profile")
  .addEdge("profile", "job_hunter")
  .addConditionalEdges("job_hunter", routeScrapers, ["scraper_node", "dedup"])
  .addEdge("scraper_node", "dedup")
  .addEdge("dedup", "matcher")
  .addEdge("matcher", "document")
  .addEdge("document", "apply_router")
  .addConditionalEdges("apply_router", routeApplications, [
    "easy_apply",
    "form_fill",
    "email_apply",
    "manual_download",
    "tracker"
  ])
  .addEdge("easy_apply", "tracker")
  .addEdge("form_fill", "tracker")
  .addEdge("email_apply", "tracker")
  .addEdge("manual_download", "tracker")
  .addEdge("tracker", "notification")
  .addEdge("notification", END);

export const app = workflow.compile();
