import { prisma } from "../db/client.js";

export async function dedupAgent(state) {
  const rawListings = state.rawListings ?? [];
  if (rawListings.length === 0) {
    return {
      dedupedListings: [],
      runMetadata: {
        ...state.runMetadata,
        jobsDiscovered: 0
      }
    };
  }

  const uniqueListings = [...new Map(rawListings.filter((job) => job.url).map((job) => [job.url, job])).values()];
  const urls = uniqueListings.map((job) => job.url);
  const existing = await prisma.jobListing.findMany({
    where: {
      url: { in: urls }
    },
    select: { url: true }
  });
  const seenUrls = new Set(existing.map((job) => job.url));

  const dedupedListings = uniqueListings
    .filter((listing) => !seenUrls.has(listing.url))
    .map(normalizeListing);

  await persistListings(dedupedListings);

  return {
    dedupedListings,
    runMetadata: {
      ...state.runMetadata,
      jobsDiscovered: rawListings.length
    }
  };
}

function normalizeListing(listing) {
  return {
    platform: listing.platform,
    externalId: String(listing.externalId || listing.url),
    url: listing.url,
    title: clean(listing.title),
    company: clean(listing.company) || "Unknown",
    location: clean(listing.location),
    description: clean(listing.description),
    applyUrl: listing.applyUrl || listing.url,
    applyEmail: listing.applyEmail || extractEmail(listing.description),
    postedAt: parseDate(listing.postedAt),
    discoveredAt: new Date(),
    rawData: listing
  };
}

async function persistListings(listings) {
  for (const listing of listings) {
    await prisma.jobListing.upsert({
      where: { url: listing.url },
      update: toJobListingUpdate(listing),
      create: toJobListingCreate(listing)
    });
  }
}

function toJobListingCreate(listing) {
  return {
    platform: listing.platform,
    externalId: listing.externalId,
    url: listing.url,
    title: listing.title,
    company: listing.company,
    location: listing.location || null,
    description: listing.description || null,
    applyUrl: listing.applyUrl || null,
    applyEmail: listing.applyEmail || null,
    postedAt: listing.postedAt || null,
    discoveredAt: listing.discoveredAt,
    rawData: listing.rawData || listing
  };
}

function toJobListingUpdate(listing) {
  return {
    platform: listing.platform,
    externalId: listing.externalId,
    title: listing.title,
    company: listing.company,
    location: listing.location || null,
    description: listing.description || null,
    applyUrl: listing.applyUrl || null,
    applyEmail: listing.applyEmail || null,
    postedAt: listing.postedAt || null,
    rawData: listing.rawData || listing
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractEmail(value) {
  return String(value ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
