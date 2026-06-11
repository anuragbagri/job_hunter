import { browserManager } from "../../browser/browserManager.js";

const platform = "himalayas";

export async function scrape(state) {
  try {
    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    await page.goto("https://himalayas.app/jobs?category=software-development", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(1200);

    const listings = await page.$$eval("a[href*='/jobs/']", (anchors) =>
      anchors
        .map((anchor) => {
          const card = anchor.closest("article, li, div");
          const text = card?.textContent ?? anchor.textContent ?? "";
          return {
            url: anchor.href,
            title: anchor.querySelector("h2, h3")?.textContent ?? anchor.textContent ?? "",
            company: card?.querySelector("[data-testid*='company'], .company")?.textContent ?? "",
            description: text
          };
        })
        .filter((listing) => listing.url && listing.title)
    );

    await page.close();

    return {
      rawListings: uniqueByUrl(
        listings.map((listing) => ({
          platform,
          externalId: externalIdFromUrl(listing.url),
          url: listing.url,
          title: clean(listing.title),
          company: clean(listing.company) || inferCompany(listing.description),
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

function inferCompany(description) {
  const [firstLine] = clean(description).split(" at ");
  return firstLine && firstLine.length < 80 ? firstLine : "Unknown";
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
