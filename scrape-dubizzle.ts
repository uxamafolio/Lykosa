/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dubizzle Dubai — Owner Apartment Listings Monitor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Scrapes Dubizzle owner apartment listings, persists seen listings to a
 *  local JSON file, and sends Telegram notifications for newly discovered
 *  listings. Runs automatically every 10 minutes.
 *
 *  Target:
 *    https://dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat/?is_owner=1
 *
 *  Features:
 *    1. LOCAL MEMORY  — seen_listings.json tracks every listing ever seen
 *    2. TELEGRAM      — instant notification for new listings (title, price, link)
 *    3. INTERVAL      — auto-runs every 10 minutes with graceful shutdown
 *
 *  Usage:
 *    TELEGRAM_BOT_TOKEN=123456:ABC-DEF \
 *    TELEGRAM_CHAT_ID=987654321 \
 *    bun run scrape-dubizzle.ts
 *
 *  Requirements:
 *    bun add playwright playwright-extra puppeteer-extra-plugin-stealth z-ai-web-dev-sdk
 *    npx playwright install chromium
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Configuration ───────────────────────────────────────────────────────

const TARGET_URL =
  "https://dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat/?is_owner=1";

const CUSTOM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_LISTINGS = 5;
const PLAYWRIGHT_TIMEOUT_MS = 90_000;
const CHECK_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes
const SEEN_LISTINGS_PATH = join(import.meta.dir, "seen_listings.json");

// Telegram — set via environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ─── Types ───────────────────────────────────────────────────────────────

interface Listing {
  title: string;
  url: string;
  price: string; // e.g. "AED 80,000 / Yearly" or "" if unavailable
}

interface SeenListingRecord {
  url: string;
  title: string;
  price: string;
  firstSeen: string; // ISO timestamp
}

interface SeenListingsFile {
  lastUpdated: string;
  listings: SeenListingRecord[];
}

// ─── Stealth Playwright setup ────────────────────────────────────────────

chromium.use(stealth());

// ═══════════════════════════════════════════════════════════════════════════
//  1. LOCAL MEMORY — seen_listings.json
// ═══════════════════════════════════════════════════════════════════════════

function loadSeenListings(): SeenListingsFile {
  if (!existsSync(SEEN_LISTINGS_PATH)) {
    return { lastUpdated: new Date().toISOString(), listings: [] };
  }
  try {
    const raw = readFileSync(SEEN_LISTINGS_PATH, "utf-8");
    return JSON.parse(raw) as SeenListingsFile;
  } catch {
    console.warn("⚠️  Could not parse seen_listings.json — starting fresh.");
    return { lastUpdated: new Date().toISOString(), listings: [] };
  }
}

function saveSeenListings(data: SeenListingsFile): void {
  data.lastUpdated = new Date().toISOString();
  writeFileSync(SEEN_LISTINGS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Compare fresh listings against the persisted set.
 * Returns only the listings that have NOT been seen before.
 */
function findNewListings(
  fresh: Listing[],
  seen: SeenListingsFile
): Listing[] {
  const seenUrls = new Set(seen.listings.map((r) => r.url));
  return fresh.filter((l) => !seenUrls.has(l.url));
}

/**
 * Add new listings to the persisted set and save to disk.
 */
function persistNewListings(
  newListings: Listing[],
  seen: SeenListingsFile
): SeenListingsFile {
  const now = new Date().toISOString();
  for (const l of newListings) {
    seen.listings.push({
      url: l.url,
      title: l.title,
      price: l.price,
      firstSeen: now,
    });
  }
  saveSeenListings(seen);
  return seen;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. TELEGRAM NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a Telegram message via the Bot API.
 * Silently no-ops if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.
 */
async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("📧 Telegram not configured — skipping notification.");
    return;
  }

  const url =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`❌ Telegram API error (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error("❌ Telegram fetch error:", (err as Error).message);
  }
}

/**
 * Build and send a notification for a single new listing.
 */
async function notifyNewListing(listing: Listing): Promise<void> {
  const priceLine = listing.price
    ? `💰 <b>Price:</b> ${escapeHtml(listing.price)}\n`
    : "";

  const message =
    `🏠 <b>New Dubizzle Listing!</b>\n\n` +
    `📝 <b>Title:</b> ${escapeHtml(listing.title)}\n` +
    priceLine +
    `🔗 <b>Link:</b> ${listing.url}\n\n` +
    `⏰ Detected: ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`;

  await sendTelegramMessage(message);
}

/**
 * Send a summary notification when multiple new listings are found at once.
 */
async function notifyNewListingsBatch(listings: Listing[]): Promise<void> {
  if (listings.length === 0) return;

  if (listings.length === 1) {
    await notifyNewListing(listings[0]);
    return;
  }

  const lines = listings
    .map((l, i) => {
      const pricePart = l.price ? ` — ${l.price}` : "";
      return `${i + 1}. <a href="${l.url}">${escapeHtml(l.title)}</a>${escapeHtml(pricePart)}`;
    })
    .join("\n");

  const message =
    `🏠 <b>${listings.length} New Dubizzle Listings!</b>\n\n` +
    lines +
    `\n\n⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`;

  await sendTelegramMessage(message);
}

/** Minimal HTML-entity escaping for Telegram HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRICE EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract a price string from a Dubizzle search result snippet.
 * Snippets often contain: "AED. 80,000. Yearly" or "AED 102,000 / Yearly"
 */
function extractPriceFromSnippet(snippet: string): string {
  // Pattern 1: AED. 80,000. Yearly
  let match = snippet.match(/AED\.?\s*([\d,]+(?:\.\d+)?)[.\s]*(Yearly|Monthly|Daily)?/i);
  if (match) {
    const amount = match[1];
    const period = match[2] ? ` / ${match[2]}` : "";
    return `AED ${amount}${period}`;
  }

  // Pattern 2: More general currency pattern
  match = snippet.match(/([\d,]{4,})\s*(Yearly|Monthly)/i);
  if (match) {
    return `AED ${match[1]} / ${match[2]}`;
  }

  return "";
}

/**
 * Try to extract a price from a Dubizzle listing title.
 * Titles sometimes contain: "2BHK Direct from Owner – Only AED 54,000"
 */
function extractPriceFromTitle(title: string): string {
  const match = title.match(/AED\s*([\d,]+)/i);
  if (match) {
    return `AED ${match[1]}`;
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCRAPING — Playwright (primary)
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeWithPlaywright(): Promise<Listing[]> {
  console.log("━".repeat(60));
  console.log("  METHOD 1: Playwright (stealth Chromium)");
  console.log("━".repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-size=1920,1080",
    ],
  });

  const context = await browser.newContext({
    userAgent: CUSTOM_USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: "en-AE",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,image/apng,*/*;q=0.8",
    },
  });

  // Anti-fingerprint injections
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en", "ar-AE"],
    });
    (window as any).chrome = { runtime: {} };

    const origQuery = window.navigator.permissions.query.bind(
      window.navigator.permissions
    );
    window.navigator.permissions.query = (params: any) =>
      params.name === "notifications"
        ? Promise.resolve({
            state: Notification.permission,
          } as PermissionStatus)
        : origQuery(params);

    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });
  });

  const page = await context.newPage();

  try {
    console.log(`\n→ Navigating to:\n  ${TARGET_URL}\n`);

    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });

    console.log("⏳ Waiting for Incapsula challenge to resolve…");
    await page.waitForTimeout(12_000);

    const isBlocked = await page.evaluate(() => {
      return (
        document.querySelector('iframe[id="main-iframe"]') !== null ||
        document.title.includes("Pardon Our Interruption") ||
        document.title.includes("Incapsula") ||
        document.body?.innerText?.includes("Request unsuccessful") ||
        false
      );
    });

    if (isBlocked) {
      console.log("🛡️  Incapsula challenge not resolved. Trying reload…");
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(8_000);
    }

    // Strategy A: property detail links
    const listings: Listing[] = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a")
      );
      const seen = new Set<string>();
      const results: { title: string; url: string; price: string }[] = [];

      for (const anchor of anchors) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;

        if (
          href.includes("apartmentflat") &&
          href.match(/-\d+\/?$/) &&
          !href.includes("?")
        ) {
          const heading =
            anchor.querySelector("h2, h3, h4, h5") ||
            anchor.querySelector('[class*="title" i]');

          let title = heading?.textContent?.trim() ?? "";
          if (!title) {
            title =
              anchor.textContent?.trim().split("\n")[0].trim() ?? "";
          }

          // Try to find price in card text
          const cardText = anchor.textContent ?? "";
          const priceMatch = cardText.match(
            /AED\.?\s*([\d,]+(?:\.\d+)?)[.\s]*(Yearly|Monthly)?/i
          );
          const price = priceMatch
            ? `AED ${priceMatch[1]}${priceMatch[2] ? ` / ${priceMatch[2]}` : ""}`
            : "";

          if (title && title.length > 5) {
            seen.add(href);
            results.push({
              title: title.substring(0, 200),
              url: href,
              price,
            });
          }
        }
      }

      return results;
    });

    // Strategy B: __NEXT_DATA__
    if (listings.length === 0) {
      console.log("Strategy A found nothing. Trying __NEXT_DATA__…");

      const nextDataListings = await page.evaluate(() => {
        const el = document.getElementById("__NEXT_DATA__");
        if (!el?.textContent) return [];

        try {
          const data = JSON.parse(el.textContent);
          const results: { title: string; url: string; price: string }[] = [];

          const findListings = (obj: any, depth = 0): any[] => {
            if (!obj || typeof obj !== "object" || depth > 8) return [];
            if (Array.isArray(obj)) {
              const hits = obj.filter(
                (i: any) =>
                  i && typeof i === "object" && (i.slug || i.listing_url || i.url)
              );
              if (hits.length > 0) return hits;
            }
            for (const v of Object.values(obj)) {
              const r = findListings(v, depth + 1);
              if (r.length > 0) return r;
            }
            return [];
          };

          for (const item of findListings(data)) {
            const title = item.title || item.name || item.heading || "";
            const rawUrl = item.listing_url || item.url || "";
            const url = rawUrl.startsWith("http")
              ? rawUrl
              : rawUrl.startsWith("/")
                ? `https://dubai.dubizzle.com${rawUrl}`
                : item.slug
                  ? `https://dubai.dubizzle.com${item.slug}`
                  : "";
            const price = item.price ? String(item.price) : "";

            if (title && url) results.push({ title, url, price });
          }

          return results;
        } catch {
          return [];
        }
      });

      listings.push(...nextDataListings);
    }

    await browser.close();
    return listings;
  } catch (err) {
    console.error("❌ Playwright error:", (err as Error).message);
    await browser.close();
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCRAPING — z-ai-web-dev-sdk web_search (fallback)
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeWithWebSearch(): Promise<Listing[]> {
  console.log("\n" + "━".repeat(60));
  console.log("  METHOD 2: z-ai-web-dev-sdk web_search (fallback)");
  console.log("━".repeat(60));

  const zai = await ZAI.create();

  const queries = [
    'site:dubai.dubizzle.com "direct from owner" apartment rent',
    'site:dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat owner 2026',
    'dubai.dubizzle.com apartmentflat "direct from owner" AED yearly',
    'site:dubizzle.com "direct from owner" apartment flat rent dubai 2026',
  ];

  // Collect raw search results with snippets (for price extraction)
  const allRawResults: { url: string; name: string; snippet: string }[] = [];

  for (const query of queries) {
    try {
      const results = await zai.functions.invoke("web_search", {
        query,
        num: 15,
      });

      for (const r of results) {
        allRawResults.push({
          url: r.url || "",
          name: r.name || "",
          snippet: r.snippet || "",
        });
      }
    } catch {
      // Skip failed queries
    }
  }

  const listings: Listing[] = [];
  const seenUrls = new Set<string>();

  for (const result of allRawResults) {
    const url: string = result.url;
    const name: string = result.name;
    const snippet: string = result.snippet;
    if (!url || !name) continue;

    // Only keep individual listing pages — date-path like /2026/4/28/
    const hasDatePath = /\d{4}\/\d{1,2}\/\d{1,2}\//.test(url);
    const hasApartmentFlat = url.includes("apartmentflat");
    if (!hasDatePath || !hasApartmentFlat) continue;

    // Normalize URL: domain + /en/ path
    let absoluteUrl = url.startsWith("http")
      ? url
      : `https://dubai.dubizzle.com${url}`;

    absoluteUrl = absoluteUrl.replace(
      /^https:\/\/www\.dubizzle\.com\//,
      "https://dubai.dubizzle.com/"
    );
    absoluteUrl = absoluteUrl.replace(
      /^https:\/\/uae\.dubizzle\.com\//,
      "https://dubai.dubizzle.com/"
    );

    if (!absoluteUrl.includes("/en/")) {
      absoluteUrl = absoluteUrl.replace(
        "dubai.dubizzle.com/property-for-rent",
        "dubai.dubizzle.com/en/property-for-rent"
      );
    }

    if (seenUrls.has(absoluteUrl)) continue;
    seenUrls.add(absoluteUrl);

    // Clean title
    const cleanTitle = name
      .replace(/\s*[|–—]\s*(dubizzle|dubizzle Dubai|dubizzle Dubai Classifieds)\s*$/i, "")
      .trim();

    // Extract price from snippet first, then from title
    const price =
      extractPriceFromSnippet(snippet) ||
      extractPriceFromTitle(cleanTitle);

    listings.push({ title: cleanTitle, url: absoluteUrl, price });
  }

  return listings;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function printResults(listings: Listing[], source: string): void {
  const top = listings.slice(0, MAX_LISTINGS);

  if (top.length === 0) {
    console.log(`\n⚠️  No listings found via ${source}.`);
    return;
  }

  console.log(
    `\n✅ Found ${listings.length} listing(s) via ${source}. ` +
      `Showing first ${top.length}:\n`
  );
  console.log("=".repeat(80));
  top.forEach((l, i) => {
    console.log(`\n  ${i + 1}. ${l.title}`);
    if (l.price) console.log(`     💰 ${l.price}`);
    console.log(`     🔗 ${l.url}`);
  });
  console.log("\n" + "=".repeat(80));
}

function printNewListings(newListings: Listing[]): void {
  if (newListings.length === 0) {
    console.log("\n📭 No new listings this cycle.");
    return;
  }

  console.log(
    `\n🔔 ${newListings.length} NEW listing(s) found!\n`
  );
  console.log("─".repeat(60));
  newListings.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.title}`);
    if (l.price) console.log(`     💰 ${l.price}`);
    console.log(`     🔗 ${l.url}`);
    console.log();
  });
  console.log("─".repeat(60));
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. MAIN LOOP — runs every 10 minutes
// ═══════════════════════════════════════════════════════════════════════════

let isRunning = false;

async function runOnce(cycleNumber: number): Promise<void> {
  if (isRunning) {
    console.log("⏭️  Previous cycle still running — skipping this one.");
    return;
  }
  isRunning = true;

  const startedAt = new Date();
  console.log(
    `\n${"═".repeat(60)}\n` +
    `  🔄 Cycle #${cycleNumber} — ${startedAt.toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}\n` +
    `${"═".repeat(60)}`
  );

  try {
    // ── Scrape ───────────────────────────────────────────────────────────
    const playwrightListings = await scrapeWithPlaywright();

    let allListings: Listing[];

    if (playwrightListings.length >= MAX_LISTINGS) {
      allListings = playwrightListings;
    } else {
      if (playwrightListings.length > 0) {
        console.log(
          `\n⚠️  Playwright found only ${playwrightListings.length} listing(s). ` +
            `Falling back to web search for more results.`
        );
      } else {
        console.log(
          "\n⚠️  Playwright found 0 listings (site is likely behind Incapsula WAF)."
        );
        console.log("   Switching to web-search fallback…");
      }

      const searchListings = await scrapeWithWebSearch();

      // Merge + deduplicate
      allListings = [...playwrightListings];
      const seenUrls = new Set(allListings.map((l) => l.url));
      for (const l of searchListings) {
        if (!seenUrls.has(l.url)) {
          allListings.push(l);
          seenUrls.add(l.url);
        }
      }
    }

    if (allListings.length === 0) {
      console.log("\n❌ No listings found via any method this cycle.");
      return;
    }

    printResults(allListings, "Playwright + Web Search");

    // ── Detect new listings ──────────────────────────────────────────────
    const seenData = loadSeenListings();
    const newListings = findNewListings(allListings, seenData);

    printNewListings(newListings);

    // ── Persist + Notify ─────────────────────────────────────────────────
    if (newListings.length > 0) {
      // Save to seen_listings.json
      persistNewListings(newListings, seenData);
      console.log(
        `💾 Saved ${newListings.length} new listing(s) to ${SEEN_LISTINGS_PATH}`
      );

      // Send Telegram notification
      await notifyNewListingsBatch(newListings);
      console.log(
        `📲 Telegram notification(s) sent for ${newListings.length} new listing(s).`
      );
    } else {
      console.log("📭 All listings already known — no notifications sent.");
    }

    // Summary
    const totalSeen = loadSeenListings().listings.length;
    const elapsedMs = Date.now() - startedAt.getTime();
    console.log(
      `\n📊 Total tracked listings: ${totalSeen} | ` +
      `Cycle took ${(elapsedMs / 1_000).toFixed(1)}s`
    );
  } catch (err) {
    console.error("❌ Cycle error:", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

async function main(): Promise<void> {
  console.log(
    "\n" +
      "╔══════════════════════════════════════════════════════════════╗\n" +
      "║  Dubizzle Dubai — Owner Apartment Listings Monitor         ║\n" +
      "║  🔄 Auto-run every 10 minutes                              ║\n" +
      "╚══════════════════════════════════════════════════════════════╝\n"
  );

  // Validate Telegram config
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log("📲 Telegram: ✅ Configured");
    console.log(`   Chat ID: ${TELEGRAM_CHAT_ID}`);
  } else {
    console.log("📲 Telegram: ⚠️  Not configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars)");
  }

  // Show memory file status
  const existingData = loadSeenListings();
  console.log(
    `💾 Memory: ${existingData.listings.length} previously seen listing(s) in ${SEEN_LISTINGS_PATH}`
  );

  console.log(
    `⏱️  Interval: every ${CHECK_INTERVAL_MS / 60_000} minutes\n`
  );

  // ── Run first cycle immediately ────────────────────────────────────────
  let cycleNumber = 1;
  await runOnce(cycleNumber);

  // ── Schedule subsequent cycles ─────────────────────────────────────────
  const timer = setInterval(async () => {
    cycleNumber++;
    await runOnce(cycleNumber);
  }, CHECK_INTERVAL_MS);

  // ── Graceful shutdown ──────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n\n🛑 Received ${signal}. Shutting down gracefully…`);
    clearInterval(timer);
    const finalData = loadSeenListings();
    console.log(
      `💾 Final state: ${finalData.listings.length} listings tracked in ${SEEN_LISTINGS_PATH}`
    );
    console.log("👋 Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
