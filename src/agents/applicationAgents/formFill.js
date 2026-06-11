import fs from "node:fs/promises";
import { browserManager } from "../../browser/browserManager.js";

export async function formFillAgent(state) {
  const listing = state.currentListing;

  try {
    const context = await browserManager.getContext(listing.platform || "formFill");
    const page = await context.newPage();
    await page.goto(listing.applyUrl || listing.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await fillCommonFields(page, state.candidateProfile, listing);
    await uploadResumeIfPresent(page, state.candidateProfile?.resumePath);

    const submit = page
      .locator("button[type='submit'], input[type='submit'], button:has-text('Apply'), button:has-text('Submit')")
      .first();
    if ((await submit.count()) === 0) {
      throw new Error("Submit control not found");
    }

    await submit.click();
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await browserManager.saveSession(listing.platform || "formFill", context);
    await page.close();

    return { applications: [buildResult(listing, "applied")] };
  } catch (error) {
    console.error(`[form_fill] ${listing?.url} failed:`, error.message);
    return { applications: [buildResult(listing, "failed", error.message)] };
  }
}

async function fillCommonFields(page, profile, listing) {
  const fields = await page.locator("input, textarea").all();

  for (const field of fields) {
    const type = (await field.getAttribute("type").catch(() => "")) ?? "";
    if (["hidden", "file", "checkbox", "radio", "submit"].includes(type)) continue;

    const label = await fieldLabel(field);
    const value = valueForLabel(label, profile, listing);
    if (!value) continue;

    await field.fill(value).catch(() => {});
  }
}

async function fieldLabel(field) {
  const pieces = await Promise.all([
    field.getAttribute("name").catch(() => ""),
    field.getAttribute("aria-label").catch(() => ""),
    field.getAttribute("placeholder").catch(() => ""),
    field.evaluate((el) => el.labels?.[0]?.textContent ?? "").catch(() => "")
  ]);
  return pieces.filter(Boolean).join(" ").toLowerCase();
}

function valueForLabel(label, profile, listing) {
  if (/name/.test(label)) return profile.fullName;
  if (/email/.test(label)) return profile.email;
  if (/phone|mobile/.test(label)) return profile.phone;
  if (/location|city/.test(label)) return profile.location;
  if (/linkedin/.test(label)) return profile.linkedinUrl;
  if (/github/.test(label)) return profile.githubUrl;
  if (/portfolio|website/.test(label)) return profile.portfolioUrl;
  if (/cover|message|why/.test(label)) return listing.coverLetterText;
  return "";
}

async function uploadResumeIfPresent(page, resumePath) {
  if (!resumePath) return;

  try {
    await fs.access(resumePath);
    const inputs = await page.locator("input[type='file']").all();
    for (const input of inputs) {
      await input.setInputFiles(resumePath).catch(() => {});
    }
  } catch {}
}

function buildResult(listing, status, errorMessage) {
  return {
    jobId: listing.externalId,
    status,
    strategy: "form_fill",
    matchScore: listing.matchScore,
    tailoringLevel: listing.tailoringLevel,
    coverLetterText: listing.coverLetterText,
    resumeSummary: listing.resumeSummary,
    errorMessage,
    listing
  };
}
