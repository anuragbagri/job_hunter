import { browserManager } from "../../browser/browserManager.js";

const platform = "weWorkRemotely";
const rssUrl = "https://weworkremotely.com/categories/remote-programming-jobs.rss";

export async function scrape(state) {
  try {
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "job-hunter/0.1" }
    });

    if (response.ok) {
      const xml = await response.text();
      const rssListings = parseRss(xml);
      if (rssListings.length > 0) {
        return { rawListings: rssListings };
      }
    }

    return await scrapeHtmlFallback();
  } catch (error) {
    console.error(`[${platform}] scrape failed:`, error.message);
    return { rawListings: [] };
  }
}

async function scrapeHtmlFallback() {
  const context = await browserManager.getContext(platform);
  const page = await context.newPage();
  await page.goto("https://weworkremotely.com/categories/remote-programming-jobs", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForTimeout(800);

  const listings = await page.$$eval("li.feature, li.new-listing-container, article", (items) =>
    items
      .map((item) => {
        const anchor = item.querySelector("a[href*='/remote-jobs/']");
        const title =
          item.querySelector(".title, h2, h3")?.textContent ??
          anchor?.textContent ??
          "";
        const company = item.querySelector(".company, .company-name")?.textContent ?? "";
        return {
          url: anchor?.href ?? "",
          title,
          company,
          description: item.textContent ?? ""
        };
      })
      .filter((listing) => listing.url && listing.title)
  );

  await page.close();
  return {
    rawListings: listings.map((listing) => ({
      platform,
      externalId: externalIdFromUrl(listing.url),
      url: listing.url,
      title: clean(listing.title),
      company: clean(listing.company) || "Unknown",
      description: clean(listing.description),
      postedAt: null
    }))
  };
}

function parseRss(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items
    .map(([, item]) => {
      const title = decodeXml(readTag(item, "title"));
      const url = decodeXml(readTag(item, "link"));
      const description = stripHtml(decodeXml(readTag(item, "description")));
      const postedAt = readTag(item, "pubDate") ? new Date(readTag(item, "pubDate")) : null;
      const [company, role] = title.includes(":")
        ? title.split(/:(.+)/).map(clean)
        : ["Unknown", title];

      return {
        platform,
        externalId: externalIdFromUrl(url),
        url,
        title: role || title,
        company: company || "Unknown",
        description,
        postedAt
      };
    })
    .filter((listing) => listing.url && listing.title);
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function decodeXml(value) {
  return String(value ?? "")
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function externalIdFromUrl(url) {
  return new URL(url).pathname.replace(/^\/|\/$/g, "");
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
