import { browserManager } from "../../browser/browserManager.js";
import { config } from "../../config/index.js";

const platform = "naukri";

export async function scrape(state) {
  try {
    if (!config.NAUKRI_ENABLED) return { rawListings: [] };

    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    await ensureLoggedIn(page, context);
    await page.goto("https://www.naukri.com/remote-software-engineer-jobs", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await page.waitForTimeout(1500);

    const listings = await page.$$eval(".srp-jobtuple-wrapper, article, .jobTuple", (cards) =>
      cards
        .map((card) => {
          const anchor = card.querySelector("a[href*='job-listings'], a.title");
          return {
            url: anchor?.href ?? "",
            title: anchor?.textContent ?? card.querySelector(".title")?.textContent ?? "",
            company: card.querySelector(".comp-name, .companyInfo, .subTitle")?.textContent ?? "",
            location: card.querySelector(".locWdth, .location")?.textContent ?? "",
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
  await page.goto("https://www.naukri.com/nlogin/login", {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  const emailInput = page.locator("input[type='text'], input[type='email'], input[placeholder*='Email']").first();
  if ((await emailInput.count()) === 0) return;

  await emailInput.fill(config.NAUKRI_EMAIL);
  await page.locator("input[type='password']").first().fill(config.NAUKRI_PASSWORD);
  await page.locator("button[type='submit'], button:has-text('Login')").first().click();
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await browserManager.saveSession(platform, context);
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
