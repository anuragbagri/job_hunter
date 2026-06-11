import { Send } from "@langchain/langgraph";
import { config } from "../config/index.js";

export async function jobHunterAgent(state) {
  return {
    enabledPlatforms: getEnabledPlatforms()
  };
}

export function routeScrapers(state) {
  if (state.enabledPlatforms.length === 0) {
    return "dedup";
  }

  return state.enabledPlatforms.map(
    (platform) =>
      new Send("scraper_node", {
        ...state,
        platform,
        rawListings: []
      })
  );
}

function getEnabledPlatforms() {
  return [
    ["remoteCo", config.REMOTE_CO_ENABLED],
    ["weWorkRemotely", config.WEWORKREMOTELY_ENABLED],
    ["mercor", config.MERCOR_ENABLED],
    ["remoteOk", config.REMOTEOK_ENABLED],
    ["himalayas", config.HIMALAYAS_ENABLED],
    ["linkedin", config.LINKEDIN_ENABLED],
    ["indeed", config.INDEED_ENABLED],
    ["naukri", config.NAUKRI_ENABLED]
  ]
    .filter(([, enabled]) => enabled)
    .map(([platform]) => platform);
}
