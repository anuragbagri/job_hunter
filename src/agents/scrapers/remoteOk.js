const platform = "remoteOk";

export async function scrape(state) {
  try {
    const response = await fetch("https://remoteok.com/remote-jobs.json", {
      headers: {
        Accept: "application/json",
        "User-Agent": "job-hunter/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Remote OK returned ${response.status}`);
    }

    const data = await response.json();
    const listings = data
      .filter((item) => item?.id && item?.position)
      .map((item) => ({
        platform,
        externalId: String(item.id),
        url: item.url ?? `https://remoteok.com/remote-jobs/${item.id}`,
        title: item.position,
        company: item.company ?? "Unknown",
        location: item.location ?? "Remote",
        description: stripHtml(item.description ?? ""),
        applyUrl: item.apply_url ?? item.url ?? "",
        postedAt: item.date ? new Date(item.date) : null
      }));

    return { rawListings: listings };
  } catch (error) {
    console.error(`[${platform}] scrape failed:`, error.message);
    return { rawListings: [] };
  }
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
