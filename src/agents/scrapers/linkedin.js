import { browserManager } from "../../browser/browserManager.js";
import { config } from "../../config/index.js";

const platform = "linkedin";

export async function scrape(state) {
  try {
    if (!config.LINKEDIN_ENABLED) return { rawListings: [] };

    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    await ensureLoggedIn(page, context);
    await page.goto("https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&f_WT=2", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await humanDelay(page);

    const listings = await page.$$eval(".job-card-container, .jobs-search-results__list-item", (cards) =>
      cards
        .map((card) => {
          const anchor = card.querySelector("a[href*='/jobs/view/']");
          return {
            url: anchor?.href?.split("?")[0] ?? "",
            title:
              card.querySelector(".job-card-list__title, .job-card-container__link, h3")?.textContent ??
              anchor?.textContent ??
              "",
            company: card.querySelector(".job-card-container__primary-description, .job-card-container__company-name")?.textContent ?? "",
            location: card.querySelector(".job-card-container__metadata-item")?.textContent ?? "",
            description: card.textContent ?? ""
          };
        })
        .filter((listing) => listing.url && listing.title)
    );

    await browserManager.saveSession(platform, context);
    await page.close();

    return {
      rawListings: uniqueByUrl(
        listings.map((listing) => ({
          platform,
          externalId: externalIdFromUrl(listing.url),
          url: listing.url,
          title: clean(listing.title),
          company: clean(listing.company) || "Unknown",
          location: clean(listing.location),
          description: clean(listing.description),
          postedAt: null
        }))
      )
    };
  } catch (error) {
    console.error(`[${platform}] scrape failed:`, error.message);
    return { rawListings: [] };
  }
}

async function ensureLoggedIn(page, context) {
  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  if (!page.url().includes("/login")) return;

  await page.locator("#username, input[name='session_key']").first().fill(config.LINKEDIN_EMAIL);
  await page.locator("#password, input[name='session_password']").first().fill(config.LINKEDIN_PASSWORD);
  await page.locator("button[type='submit']").first().click();
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await browserManager.saveSession(platform, context);
}

async function humanDelay(page) {
  await page.waitForTimeout(900 + Math.floor(Math.random() * 900));
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(600 + Math.floor(Math.random() * 700));
}

function externalIdFromUrl(url) {
  return new URL(url).pathname.replace(/^\/|\/$/g, "");
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueByUrl(listings) {
  return [...new Map(listings.filter((job) => job.url && job.title).map((job) => [job.url, job])).values()];
}
