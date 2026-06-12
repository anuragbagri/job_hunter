# Job Hunter Prototype

> Developer prototype for an automated job-hunting pipeline. Configure it for your own profile, target roles, platforms, LLM provider, schedule, and apply workflow.

This is not a production-ready autonomous applicant. It is a configurable base you can adapt on demand. Keep submit-style automation disabled until you have reviewed the scrapers, generated documents, browser actions, email settings, and job-board rules for your use case.

## Start Here

- [ ] Install dependencies.
- [ ] Create `.env` from `.env.example`.
- [ ] Add database, LLM, email, resume, and platform settings.
- [ ] Run Prisma generate and migrations.
- [ ] Create one `UserProfile` record.
- [ ] Run the pipeline once with `npm run run`.
- [ ] Review generated artifacts in `data/applications/`.
- [ ] Only then consider enabling apply automation.

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run run
```

## Navigation

- [Tech Used](#tech-used)
- [Prototype Control Panel](#prototype-control-panel)
- [How The Pipeline Works](#how-the-pipeline-works)
- [Scraping And Browser Automation](#scraping-and-browser-automation)
- [Data Model](#data-model)
- [Setup](#setup)
- [Required Runtime Data](#required-runtime-data)
- [Run Modes](#run-modes)
- [Configuration Reference](#configuration-reference)
- [Customization Recipes](#customization-recipes)
- [Project Map](#project-map)
- [Safety Checklist](#safety-checklist)
- [Troubleshooting](#troubleshooting)

## Tech Used

| Area | Tech | Where | Why it is used |
| --- | --- | --- | --- |
| Runtime | Node.js 20+ with ES modules | `package.json`, `src/**/*.js` | Runs the whole prototype as modern JavaScript modules. |
| Pipeline orchestration | LangGraph | `src/pipeline/graph.js`, `src/pipeline/state.js` | Wires agents into a stateful workflow: profile -> scrape -> dedupe -> match -> documents -> apply -> track -> notify. |
| LLM integration | LangChain | `src/llm/client.js`, `src/agents/matcherAgent.js`, `src/agents/documentAgent.js` | Calls Gemini or OpenAI models and requests structured output for matching and document generation. |
| LLM providers | Gemini and OpenAI | `.env`, `src/llm/client.js` | Lets you switch providers through `LLM_PROVIDER`. |
| Database ORM | Prisma 7 | `prisma/schema.prisma`, `src/db/client.js` | Defines the database schema and persists profiles, listings, applications, and run logs. |
| Database | PostgreSQL or Neon PostgreSQL | `DATABASE_URL`, `src/db/client.js` | Stores all durable pipeline data. The current client uses the Neon Prisma adapter. |
| Browser automation | Playwright | `src/browser/browserManager.js`, scrapers, application agents | Opens real Chromium pages for dynamic job boards, login flows, form filling, and easy-apply flows. |
| Browser compatibility layer | `playwright-extra` + `puppeteer-extra-plugin-stealth` | `src/browser/browserManager.js` | Runs Playwright with the stealth plugin to reduce common automation fingerprints. |
| Scheduling | `node-cron` | `src/scheduler/cron.js` | Runs the pipeline on `CRON_SCHEDULE`. |
| Email | Nodemailer | `src/agents/notificationAgent.js`, `src/agents/applicationAgents/emailApply.js`, `src/pipeline/runner.js` | Sends run summaries, failure alerts, and email applications. |
| Resume parsing | `pdf-parse` | `src/agents/profileAgent.js` | Extracts text from the candidate resume PDF before LLM matching. |
| Config validation | Zod | `src/config/index.js` | Validates `.env`, coerces booleans/numbers, and blocks missing required credentials. |
| CLI output | `cli-table3` | `src/agents/notificationAgent.js` | Prints application summaries in the terminal. |

## Main Architecture Choices

- The project is agent-based. Each stage is a small module under `src/agents/`.
- The workflow is centralized in `src/pipeline/graph.js`, so you can replace one stage without rewriting the full runner.
- The database is the source of truth for profiles, listings, applications, and run history.
- LLM usage is isolated behind `src/llm/client.js`, so model/provider switching is config-driven.
- Browser state is saved per platform in `sessions/`, which lets logged-in platforms reuse cookies/local storage between runs.
- Auto-apply is behind explicit gates because this is a prototype and real submissions need human review.

## Prototype Control Panel

Use this section as the main place to decide what behavior you want.

| You want to... | Configure this | Then edit this if needed |
| --- | --- | --- |
| Run manually only | `AUTO_APPLY_ENABLED=false` | `src/agents/applicationAgents/manualDownload.js` |
| Change job sources | `REMOTE_CO_ENABLED`, `LINKEDIN_ENABLED`, etc. | `src/agents/jobHunterAgent.js`, `src/pipeline/graph.js` |
| Make matching stricter | `MATCH_THRESHOLD=85` | `src/agents/matcherAgent.js` |
| Limit spend/API calls | `MAX_LISTINGS_PER_RUN=3` | `src/agents/matcherAgent.js` |
| Switch LLM provider | `LLM_PROVIDER=gemini` or `openai` | `src/llm/client.js` |
| Debug browser flows | `HEADLESS=false`, `SLOW_MO_MS=250` | `src/browser/browserManager.js` |
| Schedule daily runs | `CRON_SCHEDULE="0 9 * * *"` | `src/scheduler/cron.js` |
| Send email applications | SMTP `EMAIL_*` values | `src/agents/applicationAgents/emailApply.js` |
| Enable controlled LinkedIn auto apply | `LINKEDIN_AUTO_APPLY_ENABLED=true`, `LINKEDIN_AUTO_APPLY_RUN_CAP=1` | `src/pipeline/graph.js` |

## How The Pipeline Works

```text
UserProfile + resume PDF
        |
        v
profileAgent
        |
        v
jobHunterAgent -> enabled scrapers
        |
        v
dedupAgent -> PostgreSQL JobListing records
        |
        v
matcherAgent -> LLM score + apply strategy
        |
        v
documentAgent -> cover letter + resume summary
        |
        v
apply router
        |
        +--> manualDownloadAgent -> data/applications/<job-id>/
        +--> emailApplyAgent
        +--> formFillAgent
        +--> easyApplyAgent
        |
        v
trackerAgent -> Application records
        |
        v
notificationAgent -> console table + digest email
```

Supported scraper slots:

- Remote.co
- We Work Remotely
- Remote OK
- Himalayas
- Mercor
- LinkedIn
- Indeed
- Naukri

Some platforms require credentials and saved browser sessions. Some are disabled by default because they need more review before real use.

## Scraping And Browser Automation

This prototype uses three scraping styles depending on the platform:

| Platform | Current approach | File |
| --- | --- | --- |
| Remote OK | Public JSON endpoint with `fetch()` | `src/agents/scrapers/remoteOk.js` |
| We Work Remotely | RSS first, Playwright HTML fallback | `src/agents/scrapers/weWorkRemotely.js` |
| Remote.co | Playwright DOM extraction | `src/agents/scrapers/remoteCo.js` |
| Himalayas | Playwright DOM extraction | `src/agents/scrapers/himalayas.js` |
| Mercor | Login-capable Playwright flow | `src/agents/scrapers/mercor.js` |
| LinkedIn | Login-capable Playwright flow with saved session | `src/agents/scrapers/linkedin.js` |
| Indeed | Optional login Playwright flow with saved session | `src/agents/scrapers/indeed.js` |
| Naukri | Login-capable Playwright flow with saved session | `src/agents/scrapers/naukri.js` |

### How scraping works

1. `jobHunterAgent` reads platform flags from `.env`.
2. `routeScrapers()` sends one graph branch per enabled platform.
3. Each scraper returns `rawListings`.
4. `dedupAgent` normalizes records, removes repeated URLs, checks existing database rows, and persists new `JobListing` records.
5. Later stages only work on new deduped listings.

The common listing shape is:

```js
{
  platform: "remoteOk",
  externalId: "123",
  url: "https://example.com/job/123",
  title: "Software Engineer",
  company: "Example Co",
  location: "Remote",
  description: "...",
  applyUrl: "https://example.com/apply/123",
  applyEmail: "jobs@example.com",
  postedAt: new Date()
}
```

### Playwright details

Browser setup lives in `src/browser/browserManager.js`.

It currently uses:

- `playwright-extra` Chromium
- `puppeteer-extra-plugin-stealth`
- persistent storage state per platform: `sessions/<platform>.json`
- a desktop Chrome user agent
- a fixed `1366x900` viewport
- `HEADLESS` and `SLOW_MO_MS` from `.env`

The scraper files use Playwright when the site needs rendered DOM, login, scrolling, or form interaction. For simpler sources, the code prefers direct API/RSS access because it is faster and less brittle.

### About bypassing and anti-bot friction

In this prototype, "bypass" means reducing normal automation friction while still using a real browser session:

- the stealth plugin adjusts common browser automation fingerprints;
- saved sessions reuse legitimate cookies/local storage after login;
- some scrapers add small waits and scrolls before extracting DOM data;
- authenticated platforms use configured credentials and then save the session.

This project does not solve CAPTCHAs, break paywalls, override access controls, or force access when a platform blocks automation. If a platform presents a challenge, consent screen, MFA, or policy restriction, handle that manually and decide whether that platform should stay enabled.

## Data Model

Prisma schema lives in `prisma/schema.prisma`.

| Model | Purpose |
| --- | --- |
| `UserProfile` | Candidate identity, links, target roles, skills, and resume path. |
| `JobListing` | Normalized jobs discovered by scrapers. URLs are unique. |
| `Application` | One application attempt or manual-pending item for a listing. |
| `RunLog` | Per-run status and counters for discovered, matched, applied, and failed jobs. |

The generated Prisma client is written to:

```text
src/generated/prisma
```

Database connection setup lives in `src/db/client.js`.

## Setup

<details open>
<summary><strong>1. Install dependencies</strong></summary>

```bash
npm install
```

Requires Node.js 20+.

</details>

<details open>
<summary><strong>2. Create environment config</strong></summary>

```bash
cp .env.example .env
```

Minimum required values:

- `DATABASE_URL`
- `LLM_PROVIDER`
- `GEMINI_API_KEY` when `LLM_PROVIDER=gemini`
- `OPENAI_API_KEY` when `LLM_PROVIDER=openai`
- SMTP `EMAIL_*` values
- `RESUME_PATH`

</details>

<details open>
<summary><strong>3. Prepare Prisma</strong></summary>

```bash
npm run prisma:generate
npm run prisma:migrate
```

The database provider is PostgreSQL. Neon PostgreSQL is supported by the existing Prisma adapter.

</details>

<details>
<summary><strong>4. Install Chromium if Playwright needs it</strong></summary>

```bash
npx playwright install chromium
```

Use this if browser automation fails because Chromium is missing.

</details>

## Required Runtime Data

Before running the pipeline, create one `UserProfile` row in the database. The profile agent loads the oldest profile record.

Required or strongly recommended fields:

- `fullName`
- `email`
- `targetRoles`
- `targetLocations`
- `skills`
- `resumePath`, or a valid `RESUME_PATH` in `.env`

The resume must be a readable PDF because the profile agent parses it before matching jobs.

Useful ways to create the profile:

```bash
npx prisma studio
```

Or use your database client and insert directly into `UserProfile`.

## Run Modes

| Mode | Command | Use when |
| --- | --- | --- |
| One-shot run | `npm run run` | You are testing, debugging, or running manually. |
| Scheduled worker | `npm start` | You want the cron scheduler to stay alive. |
| Prisma client generation | `npm run prisma:generate` | Schema/client output changed. |
| Migration dev flow | `npm run prisma:migrate` | Schema changed and needs a migration. |

The scheduler uses:

```env
CRON_SCHEDULE="0 9 * * *"
```

## Configuration Reference

<details open>
<summary><strong>Core controls</strong></summary>

| Variable | Purpose |
| --- | --- |
| `CRON_SCHEDULE` | Cron expression for scheduled runs. |
| `MATCH_THRESHOLD` | Minimum LLM score required before a job enters the apply/document stage. |
| `MAX_LISTINGS_PER_RUN` | Caps how many deduped listings get scored in a run. |
| `RESUME_PATH` | Default resume PDF path. |
| `HEADLESS` | Runs browser automation headless when `true`. |
| `SLOW_MO_MS` | Adds Playwright slow motion for debugging. |
| `SESSION_DIR` | Browser storage-state directory. |

</details>

<details open>
<summary><strong>LLM controls</strong></summary>

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `gemini` or `openai`. |
| `GEMINI_API_KEY` | Required when using Gemini. |
| `GEMINI_MODEL` | Gemini model name. |
| `OPENAI_API_KEY` | Required when using OpenAI. |
| `OPENAI_MODEL` | OpenAI model name. |

Provider construction lives in `src/llm/client.js`.

</details>

<details open>
<summary><strong>Apply controls</strong></summary>

| Variable | Purpose |
| --- | --- |
| `AUTO_APPLY_ENABLED` | Global gate for submit-style apply actions. |
| `LINKEDIN_AUTO_APPLY_ENABLED` | Separate LinkedIn auto-apply gate. |
| `LINKEDIN_AUTO_APPLY_RUN_CAP` | Per-run cap for LinkedIn submit-style branches. |

Default recommendation:

```env
AUTO_APPLY_ENABLED=false
LINKEDIN_AUTO_APPLY_ENABLED=false
LINKEDIN_AUTO_APPLY_RUN_CAP=0
```

</details>

<details open>
<summary><strong>Platform controls</strong></summary>

| Variable | Default role |
| --- | --- |
| `REMOTE_CO_ENABLED` | Remote.co scraper. |
| `WEWORKREMOTELY_ENABLED` | We Work Remotely scraper. |
| `REMOTEOK_ENABLED` | Remote OK scraper. |
| `HIMALAYAS_ENABLED` | Himalayas scraper. |
| `MERCOR_ENABLED` | Mercor scraper. |
| `LINKEDIN_ENABLED` | LinkedIn scraper. |
| `INDEED_ENABLED` | Indeed scraper. |
| `NAUKRI_ENABLED` | Naukri scraper. |

Credential-backed platforms also use:

- `MERCOR_EMAIL` / `MERCOR_PASSWORD`
- `LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD`
- `INDEED_EMAIL` / `INDEED_PASSWORD`
- `NAUKRI_EMAIL` / `NAUKRI_PASSWORD`

</details>

<details open>
<summary><strong>Email controls</strong></summary>

| Variable | Purpose |
| --- | --- |
| `EMAIL_HOST` | SMTP host. |
| `EMAIL_PORT` | SMTP port. |
| `EMAIL_SECURE` | SMTP secure mode. |
| `EMAIL_USER` | SMTP username. |
| `EMAIL_PASS` | SMTP password. |
| `EMAIL_FROM` | Sender address. |
| `EMAIL_TO` | Digest/error recipient. |

These settings are used by notifications and email applications.

</details>

## Customization Recipes

<details open>
<summary><strong>Add a new job platform</strong></summary>

1. Create `src/agents/scrapers/<platform>.js`.
2. Export `async function scrape(state)`.
3. Return listings with:

```js
{
  platform: "myPlatform",
  externalId: "platform-id",
  url: "https://example.com/jobs/1",
  title: "Senior Engineer",
  company: "Example Co",
  location: "Remote",
  description: "...",
  applyUrl: "https://example.com/apply/1",
  applyEmail: "jobs@example.com",
  postedAt: new Date()
}
```

4. Register the scraper in `src/pipeline/graph.js`.
5. Add an enable flag in `.env.example`.
6. Add validation/defaults in `src/config/index.js`.
7. Add it to `getEnabledPlatforms()` in `src/agents/jobHunterAgent.js`.

</details>

<details open>
<summary><strong>Make matching stricter or looser</strong></summary>

Change this in `.env`:

```env
MATCH_THRESHOLD=80
MAX_LISTINGS_PER_RUN=5
```

Then review:

- `src/agents/matcherAgent.js`
- `chooseStrategy()`
- `STRONG_MATCH_THRESHOLD`
- the model prompt in `buildPrompt()`

</details>

<details open>
<summary><strong>Stay manual-first</strong></summary>

Use this configuration:

```env
AUTO_APPLY_ENABLED=false
LINKEDIN_AUTO_APPLY_ENABLED=false
```

Matching jobs will be routed to manual output when submit-style automation is gated off.

Manual artifacts are written to:

```text
data/applications/<job-id>/
```

Expected files:

- `job.json`
- `cover_letter.txt`
- `resume_summary.txt`

</details>

<details>
<summary><strong>Debug browser automation</strong></summary>

Use visible browser mode:

```env
HEADLESS=false
SLOW_MO_MS=250
```

Relevant files:

- `src/browser/browserManager.js`
- `src/agents/applicationAgents/formFill.js`
- `src/agents/applicationAgents/easyApply.js`

Browser sessions are saved in `sessions/`.

</details>

<details>
<summary><strong>Change generated application documents</strong></summary>

Edit:

- `src/agents/documentAgent.js`

Common changes:

- Adjust cover-letter tone.
- Add screening-question drafts.
- Generate recruiter notes.
- Make resume summaries shorter or more specific.
- Add stricter schema fields to the LLM response.

</details>

<details>
<summary><strong>Change reporting or persistence</strong></summary>

Edit:

- `prisma/schema.prisma`
- `src/agents/trackerAgent.js`
- `src/agents/notificationAgent.js`

Use this when you want more statuses, richer run logs, additional email content, or dashboard-friendly data.

</details>

## Project Map

```text
src/index.js                         Scheduler entry point
src/pipeline/runner.js               One-shot pipeline runner
src/pipeline/graph.js                LangGraph workflow wiring
src/pipeline/state.js                Pipeline state shape
src/config/index.js                  Environment validation and defaults
src/db/client.js                     Prisma client setup
src/llm/client.js                    Gemini/OpenAI model factory
src/browser/browserManager.js        Playwright browser/session manager
src/agents/jobHunterAgent.js         Platform selection
src/agents/scrapers/                 Job-board scrapers
src/agents/matcherAgent.js           Match scoring and strategy selection
src/agents/documentAgent.js          Cover letter/resume summary generation
src/agents/applicationAgents/        Apply/manual-output implementations
src/agents/trackerAgent.js           Application persistence
src/agents/notificationAgent.js      Console and email run summary
prisma/schema.prisma                 Database schema
data/applications/                   Generated manual-application artifacts
sessions/                            Browser storage state per platform
```

## Safety Checklist

- [ ] Keep `AUTO_APPLY_ENABLED=false` for initial testing.
- [ ] Review every generated cover letter and resume summary.
- [ ] Use test credentials or low-risk accounts while developing.
- [ ] Confirm each scraper complies with the platform you are using.
- [ ] Keep real secrets out of git.
- [ ] Treat `sessions/` as sensitive when authenticated sites are used.
- [ ] Test browser flows with `HEADLESS=false` before allowing submit-style actions.
- [ ] Use low per-run caps before increasing automation.

## Troubleshooting

<details open>
<summary><strong>No UserProfile record found</strong></summary>

Create a `UserProfile` row before running the pipeline. The profile agent loads the oldest profile record.

</details>

<details open>
<summary><strong>Resume path errors</strong></summary>

Set `RESUME_PATH` to a real PDF or store `resumePath` on the profile record.

</details>

<details open>
<summary><strong>Database connection errors</strong></summary>

Verify:

- `DATABASE_URL`
- SSL settings
- database reachability
- Prisma migrations

</details>

<details open>
<summary><strong>LLM key errors</strong></summary>

Make sure `LLM_PROVIDER` matches the API key you configured.

Examples:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
```

</details>

<details open>
<summary><strong>No jobs found</strong></summary>

Check which `*_ENABLED` flags are true. Then check whether the relevant scraper requires credentials or a valid browser session.

</details>

<details open>
<summary><strong>Emails fail</strong></summary>

Verify SMTP host, port, secure mode, username, password, sender, and recipient settings.

</details>
