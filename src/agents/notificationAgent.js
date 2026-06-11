import Table from "cli-table3";
import nodemailer from "nodemailer";
import { config } from "../config/index.js";

export async function notificationAgent(state) {
  printSummaryTable(state.applications ?? []);
  await sendDigestEmail(state);
  return {};
}

function printSummaryTable(applications) {
  const table = new Table({
    head: ["Job Title", "Company", "Platform", "Score", "Strategy", "Status"],
    wordWrap: true
  });

  for (const application of applications) {
    const listing = application.listing ?? {};
    table.push([
      listing.title ?? "",
      listing.company ?? "",
      listing.platform ?? "",
      application.matchScore ?? "",
      application.strategy,
      application.status
    ]);
  }

  console.log(table.toString());
}

async function sendDigestEmail(state) {
  const transporter = nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    secure: config.EMAIL_SECURE,
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASS
    }
  });

  const metadata = state.runMetadata ?? {};
  const html = buildDigestHtml(metadata, state.applications ?? []);

  await transporter.sendMail({
    from: config.EMAIL_FROM,
    to: config.EMAIL_TO,
    subject: `Job hunter run ${metadata.runId ?? ""} summary`,
    html
  });
}

function buildDigestHtml(metadata, applications) {
  const rows = applications
    .map((application) => {
      const listing = application.listing ?? {};
      return `<tr>
        <td>${escapeHtml(listing.title ?? "")}</td>
        <td>${escapeHtml(listing.company ?? "")}</td>
        <td>${escapeHtml(listing.platform ?? "")}</td>
        <td>${application.matchScore ?? ""}</td>
        <td>${escapeHtml(application.strategy ?? "")}</td>
        <td>${escapeHtml(application.status ?? "")}</td>
      </tr>`;
    })
    .join("");

  return `<h1>Job hunter run summary</h1>
  <p>Discovered: ${metadata.jobsDiscovered ?? 0}</p>
  <p>Matched: ${metadata.jobsMatched ?? 0}</p>
  <p>Applied: ${metadata.jobsApplied ?? 0}</p>
  <p>Failed: ${metadata.jobsFailed ?? 0}</p>
  <table border="1" cellpadding="6" cellspacing="0">
    <thead>
      <tr>
        <th>Job Title</th>
        <th>Company</th>
        <th>Platform</th>
        <th>Score</th>
        <th>Strategy</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
