import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const numberFromEnv = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return value;
  return Number(value);
}, z.number());

const configSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    LLM_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
    OPENAI_API_KEY: z.string().optional().default(""),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
    GEMINI_API_KEY: z.string().optional().default(""),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    CRON_SCHEDULE: z.string().min(1).default("0 9 * * *"),
    MATCH_THRESHOLD: numberFromEnv.default(70),
    MAX_LISTINGS_PER_RUN: numberFromEnv.default(5),
    SESSION_DIR: z.string().min(1).default("./sessions"),
    RESUME_PATH: z.string().min(1).default("./data/resume.pdf"),
    HEADLESS: booleanFromEnv.default(true),
    SLOW_MO_MS: numberFromEnv.default(0),
    AUTO_APPLY_ENABLED: booleanFromEnv.default(false),

    EMAIL_HOST: z.string().min(1),
    EMAIL_PORT: numberFromEnv.default(587),
    EMAIL_SECURE: booleanFromEnv.default(false),
    EMAIL_USER: z.string().min(1),
    EMAIL_PASS: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    EMAIL_TO: z.string().email(),

    REMOTE_CO_ENABLED: booleanFromEnv.default(true),
    WEWORKREMOTELY_ENABLED: booleanFromEnv.default(true),
    MERCOR_ENABLED: booleanFromEnv.default(false),
    REMOTEOK_ENABLED: booleanFromEnv.default(true),
    HIMALAYAS_ENABLED: booleanFromEnv.default(true),
    LINKEDIN_ENABLED: booleanFromEnv.default(false),
    LINKEDIN_AUTO_APPLY_ENABLED: booleanFromEnv.default(false),
    LINKEDIN_AUTO_APPLY_RUN_CAP: numberFromEnv.default(0),
    INDEED_ENABLED: booleanFromEnv.default(false),
    NAUKRI_ENABLED: booleanFromEnv.default(false),

    MERCOR_EMAIL: z.string().optional().default(""),
    MERCOR_PASSWORD: z.string().optional().default(""),
    LINKEDIN_EMAIL: z.string().optional().default(""),
    LINKEDIN_PASSWORD: z.string().optional().default(""),
    INDEED_EMAIL: z.string().optional().default(""),
    INDEED_PASSWORD: z.string().optional().default(""),
    NAUKRI_EMAIL: z.string().optional().default(""),
    NAUKRI_PASSWORD: z.string().optional().default("")
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when LLM_PROVIDER=openai"
      });
    }

    if (env.LLM_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is required when LLM_PROVIDER=gemini"
      });
    }

    const guardedCredentials = [
      ["MERCOR_ENABLED", "MERCOR_EMAIL", "MERCOR_PASSWORD"],
      ["LINKEDIN_ENABLED", "LINKEDIN_EMAIL", "LINKEDIN_PASSWORD"],
      ["INDEED_ENABLED", "INDEED_EMAIL", "INDEED_PASSWORD"],
      ["NAUKRI_ENABLED", "NAUKRI_EMAIL", "NAUKRI_PASSWORD"]
    ];

    for (const [flag, emailKey, passwordKey] of guardedCredentials) {
      if (!env[flag]) continue;
      if (!env[emailKey]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [emailKey],
          message: `${emailKey} is required when ${flag}=true`
        });
      }
      if (!env[passwordKey]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [passwordKey],
          message: `${passwordKey} is required when ${flag}=true`
        });
      }
    }
  });

export const config = configSchema.parse(process.env);
