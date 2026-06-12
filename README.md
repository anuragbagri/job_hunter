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

- [Prototype Control Panel](#prototype-control-panel)
- [How The Pipeline Works](#how-the-pipeline-works)
- [Setup](#setup)
- [Required Runtime Data](#required-runtime-data)
- [Run Modes](#run-modes)
- [Configuration Reference](#configuration-reference)
- [Customization Recipes](#customization-recipes)
- [Project Map](#project-map)
- [Safety Checklist](#safety-checklist)
- [Troubleshooting](#troubleshooting)

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
