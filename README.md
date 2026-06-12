# Job Hunter Prototype

This repository is a developer prototype for an automated job-hunting pipeline. It is meant to be configured, extended, and hardened for a specific candidate, job market, and workflow. Treat it as a starting point, not a production-ready autonomous applicant.

Auto-apply behavior is intentionally gated by configuration. Keep it disabled until you have reviewed the scrapers, generated documents, browser actions, email settings, and the job-board rules that apply to your use case.

## What It Does

The pipeline:

1. Loads the candidate profile and resume PDF.
2. Runs enabled job-board scrapers.
3. Deduplicates listings and stores new jobs in PostgreSQL.
4. Scores listings with an LLM.
5. Generates cover letters and resume summaries when needed.
6. Routes each job to manual download, email apply, form fill, or easy apply.
7. Tracks applications and sends a run summary email.

Current supported scraper slots:

- Remote.co
- We Work Remotely
- Remote OK
- Himalayas
- Mercor
- LinkedIn
- Indeed
- Naukri

Some platforms require credentials and browser sessions. Some are disabled by default because they need more review before real use.

## Tech Stack

- Node.js 20+
- ES modules
- LangGraph for pipeline orchestration
- LangChain with Gemini or OpenAI chat models
- Prisma 7
- PostgreSQL or Neon PostgreSQL
- Playwright with stealth plugin for browser automation
- Nodemailer for digests, error alerts, and email applications

## Project Layout

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

## Setup

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Edit `.env` for your local or hosted environment. The required minimum is:

- `DATABASE_URL`
- `LLM_PROVIDER`
- The matching LLM API key, either `GEMINI_API_KEY` or `OPENAI_API_KEY`
- SMTP settings used by notification and email-apply flows
- `RESUME_PATH`

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run prisma:migrate
```

Install a browser if your local Playwright install does not already have Chromium:

```bash
npx playwright install chromium
```

## Required Runtime Data

Before running the pipeline, create one `UserProfile` record in the database. The `profileAgent` loads the oldest profile record and reads its `resumePath`; if `resumePath` is empty, it falls back to `RESUME_PATH`.

You can create the profile with Prisma Studio, a one-off seed script, or direct database tooling. The profile should include:

- `fullName`
- `email`
- `targetRoles`
- `targetLocations`
- `skills`
- `resumePath`, or a valid `RESUME_PATH` in `.env`

The resume must be a readable PDF because the profile agent parses it before matching jobs.

## Running

Run the pipeline once:

```bash
npm run run
```

Start the scheduler:

```bash
npm start
```

The scheduler uses `CRON_SCHEDULE` from `.env`.

## Key Configuration

Most prototype behavior can be changed from `.env` and `src/config/index.js`.

| Variable | Purpose |
| --- | --- |
| `CRON_SCHEDULE` | Cron expression for scheduled runs. |
| `MATCH_THRESHOLD` | Minimum LLM score required before a job enters the apply/document stage. |
| `MAX_LISTINGS_PER_RUN` | Caps how many deduped listings get scored in a run. |
| `RESUME_PATH` | Default resume PDF path. |
| `HEADLESS` | Runs browser automation headless when `true`. |
| `SLOW_MO_MS` | Adds Playwright slow motion for debugging. |
| `AUTO_APPLY_ENABLED` | Global gate for real submit-style apply actions. |
| `LINKEDIN_AUTO_APPLY_ENABLED` | Separate LinkedIn auto-apply gate. |
| `LINKEDIN_AUTO_APPLY_RUN_CAP` | Per-run cap for LinkedIn submit-style branches. |
| `*_ENABLED` | Enables or disables individual platforms. |
| `*_EMAIL` / `*_PASSWORD` | Platform credentials for authenticated scrapers. |
| `EMAIL_*` | SMTP and digest email configuration. |

By default, the safer path is manual output. Manual applications are written under:

```text
data/applications/<job-id>/
```

Each folder can contain:

- `job.json`
- `cover_letter.txt`
- `resume_summary.txt`

## Customizing For Your Demand

This codebase is intentionally structured so you can configure or replace each stage.

Change platform selection:

- Update `.env` platform flags.
- Add new config keys in `src/config/index.js`.
- Map enabled platforms in `src/agents/jobHunterAgent.js`.

Add a new scraper:

1. Create `src/agents/scrapers/<platform>.js`.
2. Export `async function scrape(state)`.
3. Return listings with `platform`, `externalId`, `url`, `title`, `company`, and optional `description`, `location`, `applyUrl`, `applyEmail`, `postedAt`.
4. Register it in `src/pipeline/graph.js`.
5. Add an enable flag in `.env.example` and `src/config/index.js`.

Change matching rules:

- Edit `src/agents/matcherAgent.js`.
- Tune `MATCH_THRESHOLD`.
- Change `chooseStrategy()` if you want stricter manual review or different application routing.

Change document generation:

- Edit prompts and schema in `src/agents/documentAgent.js`.
- Add more generated artifacts if your workflow needs role-specific resumes, recruiter notes, or screening-question drafts.

Change apply behavior:

- Manual output: `src/agents/applicationAgents/manualDownload.js`
- Email apply: `src/agents/applicationAgents/emailApply.js`
- Generic form fill: `src/agents/applicationAgents/formFill.js`
- Native easy apply: `src/agents/applicationAgents/easyApply.js`

Change tracking or reporting:

- Database models live in `prisma/schema.prisma`.
- Application persistence lives in `src/agents/trackerAgent.js`.
- Console/email summaries live in `src/agents/notificationAgent.js`.

Change LLM provider:

- Set `LLM_PROVIDER=gemini` or `LLM_PROVIDER=openai`.
- Configure models through `GEMINI_MODEL` or `OPENAI_MODEL`.
- Provider construction is in `src/llm/client.js`.

## Safety Notes

- This is a prototype. Review every generated application artifact before sending it.
- Keep `AUTO_APPLY_ENABLED=false` until the browser actions are tested against your accounts.
- Use test credentials or low-risk accounts while developing.
- Job boards often change markup and may restrict automation. Validate each scraper and application path regularly.
- Store secrets only in `.env` or your deployment secret manager. Do not commit real credentials.
- Browser sessions are stored in `sessions/`; treat them as sensitive if authenticated platforms are used.

## Troubleshooting

`No UserProfile record found`

Create a `UserProfile` row before running the pipeline.

`ENOENT` for the resume path

Set `RESUME_PATH` to a real PDF or store `resumePath` on the profile record.

Database connection errors

Verify `DATABASE_URL`, SSL settings, and that migrations have been applied.

LLM key errors

Make sure `LLM_PROVIDER` matches the API key you configured.

No jobs found

Check which `*_ENABLED` flags are true and whether the relevant scraper requires credentials or a valid browser session.

Emails fail

Verify SMTP host, port, secure mode, username, password, sender, and recipient settings.
