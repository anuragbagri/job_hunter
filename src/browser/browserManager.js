import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { config } from "../config/index.js";

chromium.use(stealth());

class BrowserManager {
  constructor() {
    this.browser = null;
    this.contexts = new Map();
  }

  async launch() {
    if (this.browser) return this.browser;

    await fs.mkdir(config.SESSION_DIR, { recursive: true });
    this.browser = await chromium.launch({
      headless: config.HEADLESS,
      slowMo: config.SLOW_MO_MS
    });
    return this.browser;
  }

  async getContext(platform) {
    if (this.contexts.has(platform)) {
      return this.contexts.get(platform);
    }

    const browser = await this.launch();
    const sessionPath = path.join(config.SESSION_DIR, `${platform}.json`);
    const storageState = await fileExists(sessionPath).then((exists) =>
      exists ? sessionPath : undefined
    );

    const context = await browser.newContext({
      storageState,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    this.contexts.set(platform, context);
    return context;
  }

  async saveSession(platform, context) {
    await fs.mkdir(config.SESSION_DIR, { recursive: true });
    const sessionPath = path.join(config.SESSION_DIR, `${platform}.json`);
    await context.storageState({ path: sessionPath });
  }

  async close() {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => {});
    }
    this.contexts.clear();

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const browserManager = new BrowserManager();
