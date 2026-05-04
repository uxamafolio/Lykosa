/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dubizzle Dubai — Apartments for Rent (Owner Listings) Scraper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Scrapes the first page and prints the title + absolute URL of the first
 *  5 listings from:
 *    https://dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat/?is_owner=1
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  Strategy                                                           │
 *  │                                                                     │
 *  │  1. PRIMARY  — Playwright (headless Chromium) with stealth mode,    │
 *  │               custom User-Agent, and anti-fingerprint injections.   │
 *  │               Waits for Incapsula JS challenge to self-resolve.     │
 *  │                                                                     │
 *  │  2. FALLBACK — z-ai-web-dev-sdk web_search when Dubizzle blocks     │
 *  │               automated browsers (Imperva/Incapsula WAF).           │
 *  │               Searches Google's index for individual listing pages   │
 *  │               and returns title + absolute URL.                     │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  Usage:
 *    bun run scrape-dubizzle.ts
 *
 *  Requirements:
 *    bun add playwright playwright-extra puppeteer-extra-plugin-stealth z-ai-web-dev-sdk
 *    npx playwright install chromium
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import ZAI from "z-ai-web-dev-sdk";

// ─── Configuration ───────────────────────────────────────────────────────

const TARGET_URL =
  "https://dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat/?is_owner=1";

const CUSTOM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_LISTINGS = 5;
const PLAYWRIGHT_TIMEOUT_MS = 90_000;

// ─── Types ───────────────────────────────────────────────────────────────

interface Listing {
  title: string;
  url: string;
}

// ─── Stealth Playwright setup ────────────────────────────────────────────

chromium.use(stealth());

// ─── Helper: print results ───────────────────────────────────────────────

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
    console.log(`     ${l.url}`);
  });
  console.log("\n" + "=".repeat(80));
}

// ═══════════════════════════════════════════════════════════════════════════
//  METHOD 1 — Playwright with stealth + anti-fingerprint
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
    // Hide webdriver flag
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    // Realistic language list
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en", "ar-AE"],
    });

    // Chrome runtime mock (many WAFs check for this)
    (window as any).chrome = { runtime: {} };

    // Override Permissions API
    const origQuery = window.navigator.permissions.query.bind(
      window.navigator.permissions
    );
    window.navigator.permissions.query = (params: any) =>
      params.name === "notifications"
        ? Promise.resolve({
            state: Notification.permission,
          } as PermissionStatus)
        : origQuery(params);

    // Override plugins to look realistic
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

    // Wait for Incapsula JS challenge to execute & page to reload
    console.log("⏳ Waiting for Incapsula challenge to resolve…");
    await page.waitForTimeout(12_000);

    // Check if we're still on the challenge page
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

    // ── Extract listings ────────────────────────────────────────────────

    // Strategy A: property detail links (anchor href matching slug pattern)
    const listings: Listing[] = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a")
      );
      const seen = new Set<string>();
      const results: Listing[] = [];

      for (const anchor of anchors) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;

        // Dubizzle property detail URLs:
        // /en/property-for-rent/residential/apartmentflat/…/slug-name-2-NNN
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

          if (title && title.length > 5) {
            seen.add(href);
            results.push({
              title: title.substring(0, 200),
              url: href,
            });
          }
        }
      }

      return results;
    });

    // Strategy B: __NEXT_DATA__ (Next.js hydration data)
    if (listings.length === 0) {
      console.log("Strategy A found nothing. Trying __NEXT_DATA__…");

      const nextDataListings = await page.evaluate(() => {
        const el = document.getElementById("__NEXT_DATA__");
        if (!el?.textContent) return [];

        try {
          const data = JSON.parse(el.textContent);
          const results: Listing[] = [];

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
            const title =
              item.title || item.name || item.heading || "";
            const rawUrl = item.listing_url || item.url || "";
            const url = rawUrl.startsWith("http")
              ? rawUrl
              : rawUrl.startsWith("/")
                ? `https://dubai.dubizzle.com${rawUrl}`
                : item.slug
                  ? `https://dubai.dubizzle.com${item.slug}`
                  : "";

            if (title && url) results.push({ title, url });
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
//  METHOD 2 — Fallback: z-ai-web-dev-sdk web_search
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeWithWebSearch(): Promise<Listing[]> {
  console.log("\n" + "━".repeat(60));
  console.log("  METHOD 2: z-ai-web-dev-sdk web_search (fallback)");
  console.log("━".repeat(60));

  const zai = await ZAI.create();

  // Use multiple search queries to maximize coverage
  const queries = [
    'site:dubai.dubizzle.com "direct from owner" apartment rent',
    'site:dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat owner 2026',
    'dubai.dubizzle.com apartmentflat "direct from owner" AED yearly',
    'site:dubizzle.com "direct from owner" apartment flat rent dubai 2026',
  ];

  const allRawResults: { url: string; name: string }[] = [];

  for (const query of queries) {
    try {
      const results = await zai.functions.invoke("web_search", {
        query,
        num: 15,
      });

      for (const r of results) {
        allRawResults.push({ url: r.url || "", name: r.name || "" });
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
    if (!url || !name) continue;

    // Only keep individual listing pages — they have a date-path like /2026/4/28/
    const hasDatePath = /\d{4}\/\d{1,2}\/\d{1,2}\//.test(url);
    const hasApartmentFlat = url.includes("apartmentflat");
    if (!hasDatePath || !hasApartmentFlat) continue;

    // Build absolute URL and normalize domain + /en/ path
    let absoluteUrl = url.startsWith("http")
      ? url
      : `https://dubai.dubizzle.com${url}`;

    // Normalize domain: www.dubizzle.com → dubai.dubizzle.com
    absoluteUrl = absoluteUrl.replace(
      /^https:\/\/www\.dubizzle\.com\//,
      "https://dubai.dubizzle.com/"
    );
    absoluteUrl = absoluteUrl.replace(
      /^https:\/\/uae\.dubizzle\.com\//,
      "https://dubai.dubizzle.com/"
    );

    // Normalize path: add /en/ if missing
    if (!absoluteUrl.includes("/en/")) {
      absoluteUrl = absoluteUrl.replace(
        "dubai.dubizzle.com/property-for-rent",
        "dubai.dubizzle.com/en/property-for-rent"
      );
    }

    // Deduplicate
    if (seenUrls.has(absoluteUrl)) continue;
    seenUrls.add(absoluteUrl);

    // Clean up the title
    const cleanTitle = name
      .replace(/\s*[|–—]\s*(dubizzle|dubizzle Dubai|dubizzle Dubai Classifieds)\s*$/i, "")
      .trim();

    listings.push({ title: cleanTitle, url: absoluteUrl });
  }

  return listings;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(
    "\n" +
      "╔══════════════════════════════════════════════════════════════╗\n" +
      "║  Dubizzle Dubai — Owner Apartment Listings Scraper         ║\n" +
      "║  Target: Apartments for Rent (Owner, First Page)           ║\n" +
      "╚══════════════════════════════════════════════════════════════╝\n"
  );

  // ── Try Method 1: Playwright ──────────────────────────────────────────
  const playwrightListings = await scrapeWithPlaywright();

  if (playwrightListings.length >= MAX_LISTINGS) {
    printResults(playwrightListings, "Playwright");
    return;
  }

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

  // ── Try Method 2: Web Search fallback ─────────────────────────────────
  const searchListings = await scrapeWithWebSearch();

  // Merge, deduplicate by URL, and show
  const allListings = [...playwrightListings];
  const seenUrls = new Set(allListings.map((l) => l.url));

  for (const l of searchListings) {
    if (!seenUrls.has(l.url)) {
      allListings.push(l);
      seenUrls.add(l.url);
    }
  }

  if (allListings.length > 0) {
    printResults(allListings, "Playwright + Web Search");
  } else {
    console.log("\n❌ No listings found via any method.");
  }
}

main();
