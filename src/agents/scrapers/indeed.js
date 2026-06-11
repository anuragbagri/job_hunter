import { browserManager } from "../../browser/browserManager.js";
import { config } from "../../config/index.js";

const platform = "indeed";

export async function scrape(state) {
  try {
    if (!config.INDEED_ENABLED) return { rawListings: [] };

    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    await ensureLoggedIn(page, context);
    await page.goto("https://www.indeed.com/jobs?q=software+engineer&l=Remote", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await humanDelay(page);

    const listings = await page.$$eval("[data-jk], .job_seen_beacon", (cards) =>
      cards
        .map((card) => {
          const anchor = card.querySelector("a[href*='/viewjob'], a[data-jk]");
          const href = anchor?.href ?? "";
          const jobKey = card.getAttribute("data-jk") ?? new URL(href || "https://www.indeed.com").searchParams.get("jk") ?? "";
          return {
            externalId: jobKey,
            url: href || (jobKey ? `https://www.indeed.com/viewjob?jk=${jobKey}` : ""),
            title: card.querySelector("h2, .jobTitle")?.textContent ?? anchor?.textContent ?? "",
            company: card.querySelector("[data-testid='company-name'], .companyName")?.textContent ?? "",
            location: card.querySelector("[data-testid='text-location'], .companyLocation")?.textContent ?? "",
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
          externalId: listing.externalId || externalIdFromUrl(listing.url),
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
  if (!config.INDEED_EMAIL || !config.INDEED_PASSWORD) return;

  await page.goto("https://secure.indeed.com/auth", {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  const emailInput = page.locator("input[type='email'], input[name='__email']").first();
  if ((await emailInput.count()) === 0) return;

  await emailInput.fill(config.INDEED_EMAIL);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  const passwordInput = page.locator("input[type='password']").first();
  if ((await passwordInput.count()) > 0) {
    await passwordInput.fill(config.INDEED_PASSWORD);
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
    await browserManager.saveSession(platform, context);
  }
}

async function humanDelay(page) {
  await page.waitForTimeout(1000 + Math.floor(Math.random() * 1200));
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800 + Math.floor(Math.random() * 900));
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
