import { browserManager } from "../../browser/browserManager.js";
import { config } from "../../config/index.js";

const platform = "mercor";

export async function scrape(state) {
  try {
    if (!config.MERCOR_ENABLED) return { rawListings: [] };

    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    await ensureLoggedIn(page, context);
    await page.goto("https://work.mercor.com/jobs", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(1500);

    const listings = await page.$$eval("a[href*='/jobs/'], a[href*='/opportunities/']", (anchors) =>
      anchors
        .map((anchor) => {
          const card = anchor.closest("article, li, div");
          return {
            url: anchor.href,
            title: anchor.querySelector("h2, h3")?.textContent ?? anchor.textContent ?? "",
            company: card?.querySelector("[data-company], .company")?.textContent ?? "Mercor",
            description: card?.textContent ?? anchor.textContent ?? ""
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
          company: clean(listing.company) || "Mercor",
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
  await page.goto("https://work.mercor.com/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  const emailInput = page.locator("input[type='email'], input[name='email']").first();
  if ((await emailInput.count()) === 0) return;

  await emailInput.fill(config.MERCOR_EMAIL);
  await page.locator("input[type='password'], input[name='password']").first().fill(config.MERCOR_PASSWORD);
  await page.locator("button[type='submit'], button:has-text('Log in'), button:has-text('Sign in')").first().click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
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
