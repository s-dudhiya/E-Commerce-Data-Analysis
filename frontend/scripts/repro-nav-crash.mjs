/**
 * Rapid-navigation crash repro v2 (resilient: never throws, dumps app state
 * after every click, collects page errors live).
 * Run: node scripts/repro-nav-crash.mjs
 */
import { chromium } from "playwright-core";

const EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:8080";

const LINKS = [
  "/price-analysis",
  "/ratings-reviews",
  "/stock-analysis",
  "/platform-comparison",
  "/explorer",
  "/data-table",
  "/",
];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 250)}`);
  }
});
page.on("pageerror", (err) => {
  pageErrors.push(String(err).slice(0, 600));
  console.log(">>> PAGEERROR:", String(err).slice(0, 600));
});
page.on("crash", () => {
  pageErrors.push("=== RENDERER CRASH ===");
  console.log(">>> RENDERER CRASH");
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("a[href='/price-analysis']", { timeout: 120000 });
console.log("dashboard ready");

const snapshot = async (label) => {
  try {
    const info = await page.evaluate(() => ({
      url: location.pathname,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 140),
      anchors: document.querySelectorAll("a").length,
      buttons: Array.from(document.querySelectorAll("button"))
        .map((b) => (b.textContent ?? "").trim())
        .filter(Boolean)
        .slice(0, 6),
    }));
    console.log(`${label}: url=${info.url} anchors=${info.anchors}`);
    console.log(`   text: ${info.text}`);
    if (info.buttons.length) console.log(`   buttons: ${info.buttons.join(" | ")}`);
  } catch (e) {
    console.log(`${label}: page unresponsive (${String(e).slice(0, 80)})`);
  }
};

for (let round = 0; round < 5; round++) {
  for (const href of LINKS) {
    try {
      const link = page.locator(`a[href="${href}"]`).first();
      await link.click({ timeout: 20000 });
      await page.waitForTimeout(round >= 1 ? 100 : 1200);
      await snapshot(`visit ${href} (round ${round})`);
    } catch {
      console.log(`CLICK FAILED on ${href} (round ${round})`);
      await snapshot(`after failed click ${href}`);
      if (round === 0) break; // first pass failure: already have evidence
    }
  }
  console.log(`--- end round ${round} ---`);
}

console.log(`\n--- total pageerrors: ${pageErrors.length} ---`);
console.log(`--- console errors/warnings (last 20 of ${consoleErrors.length}) ---`);
for (const e of consoleErrors.slice(-20)) console.log(e);

await browser.close();
