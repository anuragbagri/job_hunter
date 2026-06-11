import { browserManager } from "../../browser/browserManager.js";

const platform = "remoteCo";

export async function scrape(state) {
  const listings = [];

  try {
    const context = await browserManager.getContext(platform);
    const page = await context.newPage();

    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const url = `https://remote.co/remote-jobs/developer/?page=${pageNumber}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);

      const pageListings = await page.$$eval("a[href*='/remote-jobs/']", (anchors) =>
        anchors
          .map((anchor) => {
            const href = anchor.href;
            const title =
              anchor.querySelector("h2, h3, .font-weight-bold, span")?.textContent ??
              anchor.textContent ??
              "";
            const text = anchor.textContent ?? "";
            const company =
              anchor.closest("li, article, .card")?.querySelector(".company, .m-0, p")?.textContent ??
              "";
            return { href, title, company, text };
          })
          .filter((listing) => listing.href && /remote-jobs\/[^/]+\/?$/i.test(listing.href))
      );

      listings.push(
        ...pageListings.map((listing) => ({
          platform,
          externalId: externalIdFromUrl(listing.href),
          url: listing.href,
          title: clean(listing.title || listing.text),
          company: clean(listing.company) || "Unknown",
          description: clean(listing.text),
          postedAt: null
        }))
      );
    }

    await page.close();
    return { rawListings: uniqueByUrl(listings) };
  } catch (error) {
    console.error(`[${platform}] scrape failed:`, error.message);
    return { rawListings: [] };
  }
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
