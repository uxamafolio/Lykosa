/**
 * ═══════════════════════════════════════════════════════════════
 * Lykosa — Hunter Worker (PRD v2.1 §4.1 & §4.2)
 *
 * The Hunter: Lead Discovery Engine
 * The Brain: Filtering & Intelligence Layer
 *
 * Key Features:
 *   • Adaptive Cron with Jitter (±15–45s randomized delay)
 *   • Agent Scoring System (0–100)
 *   • Phone-Based Agent Detection
 *   • Keyword Blacklist Filtering
 *   • Source Timestamp Capture & Lead Latency
 *   • Web Search Scraping (z-ai-web-dev-sdk)
 * ═══════════════════════════════════════════════════════════════
 */

import { PrismaClient, type Listing, type AdminSetting } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────

export interface RawListing {
  title: string;
  url: string;
  price: string;
  phone?: string;
  sourceListedAt?: Date;
  source?: string;
}

export interface HunterConfig {
  /** Telegram bot token */
  telegramBotToken: string;
  /** Telegram chat ID */
  telegramChatId: string;
  /** Base scrape interval in milliseconds (default: 600000 = 10 min) */
  scrapeIntervalMs: number;
}

export interface HunterResult {
  cycleNumber: number;
  totalScraped: number;
  newListings: number;
  duplicateSkipped: number;
  blacklistedSkipped: number;
  latencyMs: number;
  jitterDelayMs: number;
  errors: string[];
}

function parseBlacklistKeywords(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function getZaiModel(): string {
  return process.env.ZAI_MODEL || "glm-4.7-flash";
}

// ─── Jitter Logic (PRD §4.1 — Adaptive Cron with Jitter) ─────

/**
 * Returns a randomized jitter delay between 15–45 seconds.
 * PRD: "Jitter: ±15–45 seconds randomized delay"
 * Ensures non-deterministic scraping patterns to avoid bot detection.
 */
export function calculateJitterDelayMs(): number {
  const MIN_JITTER_MS = 15_000; // 15 seconds
  const MAX_JITTER_MS = 45_000; // 45 seconds
  return MIN_JITTER_MS + Math.floor(Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS + 1));
}

/**
 * Sleep for the specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply jitter delay before scraping.
 * Returns the actual jitter delay applied.
 */
export async function applyJitter(): Promise<number> {
  const jitterMs = calculateJitterDelayMs();
  console.log(`  ⏳ Jitter delay: ${(jitterMs / 1_000).toFixed(1)}s`);
  await sleep(jitterMs);
  return jitterMs;
}

// ─── Agent Scoring System (PRD §4.2) ─────────────────────────

/**
 * Calculate the agent score for a listing.
 *
 * PRD §4.2 — Agent Scoring System:
 *   +40 → repeated phone
 *   +30 → keyword match
 *   +20 → high frequency posting
 *   -30 → owner-like signals
 *
 * Score range: 0–100 (clamped)
 */
export async function calculateAgentScore(
  db: PrismaClient,
  listing: RawListing,
  blacklistKeywords: string[]
): Promise<number> {
  let score = 0;

  // ── +40: Repeated Phone ────────────────────────────────────
  // If the same phone number appears in ≥5 other listings → likely agent
  if (listing.phone) {
    const phoneCount = await db.listing.count({
      where: { phone: listing.phone },
    });
    if (phoneCount >= 5) {
      score += 40;
    } else if (phoneCount >= 3) {
      score += 20; // Partial signal
    } else if (phoneCount >= 1) {
      score += 10; // Slight signal
    }
  }

  // ── +30: Keyword Match ─────────────────────────────────────
  // Title contains agent-related keywords from the blacklist
  const titleLower = listing.title.toLowerCase();
  const matchedKeywords = blacklistKeywords.filter((kw) =>
    titleLower.includes(kw.toLowerCase())
  );
  if (matchedKeywords.length > 0) {
    score += 30;
  }

  // ── +15: Title Pattern Heuristics (non-phone signals) ──────
  // Patterns commonly used by agents in listing titles
  const agentTitlePatterns = [
    /\b(call|contact)\s+(now|us|me|today)\b/i,
    /\b(best\s+price|price\s+negotiable|special\s+offer)\b/i,
    /\b(multiple\s+units?|many\s+options|various\s+sizes)\b/i,
    /\b(\d+\s*br\s+available|available\s+\d+\s+units)\b/i,
    /\bview\s+now\b/i,
  ];
  for (const pattern of agentTitlePatterns) {
    if (pattern.test(listing.title)) {
      score += 15;
      break; // Only add once
    }
  }

  // ── +20: High Frequency Posting ────────────────────────────
  // Same phone number posted multiple listings within ≤2 minutes
  if (listing.phone) {
    const recentFromPhone = await db.listing.findMany({
      where: {
        phone: listing.phone,
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 1_000), // Last 2 minutes
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (recentFromPhone.length >= 2) {
      score += 20;
    }
  }

  // ── -30: Owner-Like Signals ────────────────────────────────
  // Patterns that suggest a genuine owner, not an agent
  const ownerSignals = [
    "direct from owner",
    "owner listing",
    "no broker",
    "no commission",
    "no agent",
    "private landlord",
    "direct landlord",
    "by owner",
    "direct owner",
    "landlord direct",
  ];
  const hasOwnerSignal = ownerSignals.some((s) => titleLower.includes(s));
  if (hasOwnerSignal) {
    score -= 30;
  }

  // ── -15: Owner Context Signals (weaker but meaningful) ─────
  const weakOwnerSignals = [
    "cheque",
    "cheques",
    "no deposit",
    "flexible payment",
    "installment",
  ];
  const hasWeakOwnerSignal = weakOwnerSignals.some((s) => titleLower.includes(s));
  if (hasWeakOwnerSignal && !hasOwnerSignal) {
    score -= 15;
  }

  // Clamp to 0–100
  return Math.max(0, Math.min(100, score));
}

// ─── Phone-Based Agent Detection (PRD §4.2) ──────────────────

/**
 * If a phone number appears in ≥5 listings within ≤2 minutes,
 * mark as likely agent.
 */
export async function detectPhoneAgent(
  db: PrismaClient,
  phone: string
): Promise<boolean> {
  if (!phone) return false;

  const recentListings = await db.listing.findMany({
    where: {
      phone,
      createdAt: {
        gte: new Date(Date.now() - 2 * 60 * 1_000),
      },
    },
  });

  return recentListings.length >= 5;
}

// ─── Brain: Filtering & Intelligence (PRD §4.2) ──────────────

export interface BrainResult {
  /** Listings that passed all filters */
  verified: RawListing[];
  /** Listings blocked by keyword blacklist */
  blacklisted: RawListing[];
  /** Listings that already exist (URL dedup) */
  duplicates: RawListing[];
}

/**
 * The Brain processes raw scraped listings through:
 * 1. Keyword blacklist filtering
 * 2. URL deduplication
 * 3. Agent scoring
 * 4. Phone-based agent detection
 */
export async function processWithBrain(
  db: PrismaClient,
  rawListings: RawListing[],
  adminSettings: AdminSetting | null
): Promise<BrainResult> {
  const blacklist = parseBlacklistKeywords(adminSettings?.blacklistKeywords);
  const agentThreshold = adminSettings?.agentThreshold ?? 60;

  const verified: RawListing[] = [];
  const blacklisted: RawListing[] = [];
  const duplicates: RawListing[] = [];

  for (const listing of rawListings) {
    // Step 1: URL Deduplication
    const existingByUrl = await db.listing.findUnique({
      where: { url: listing.url },
    });
    if (existingByUrl) {
      duplicates.push(listing);
      continue;
    }

    // Step 2: Keyword Blacklist Filtering
    const titleLower = listing.title.toLowerCase();
    const isBlacklisted = blacklist.some((kw) =>
      titleLower.includes(kw.toLowerCase())
    );
    if (isBlacklisted) {
      blacklisted.push(listing);
      continue;
    }

    // Step 3: Calculate Agent Score
    const agentScore = await calculateAgentScore(db, listing, blacklist);
    listing.source = listing.source || "dubizzle";

    // Step 4: Phone-Based Agent Detection — boost score if detected
    if (listing.phone) {
      const isLikelyAgent = await detectPhoneAgent(db, listing.phone);
      if (isLikelyAgent) {
        // Already handled in calculateAgentScore, but log it
        console.log(
          `  🚨 Phone ${listing.phone} flagged as likely agent (≥5 listings in ≤2min)`
        );
      }
    }

    // All listings pass through to verified, but with their agentScore
    // The notifyMode in AdminSetting determines which ones get Telegram alerts
    verified.push(listing);
  }

  return { verified, blacklisted, duplicates };
}

// ─── Persistence: Store Listings in DB ────────────────────────

/**
 * Persist new listings to the database.
 * Returns the count of newly created listings.
 */
export async function persistListings(
  db: PrismaClient,
  listings: RawListing[],
  agentScores?: Map<string, number>
): Promise<number> {
  let created = 0;

  for (const listing of listings) {
    try {
      // Parse price from string like "AED 45,000 / Yearly" → 45000.0
      const priceNum = parsePrice(listing.price);

      await db.listing.create({
        data: {
          title: listing.title,
          price: priceNum,
          url: listing.url,
          source: listing.source || "dubizzle",
          phone: listing.phone || null,
          agentScore: agentScores?.get(listing.url) ?? 0,
          sourceListedAt: listing.sourceListedAt || null,
          status: "NEW",
        },
      });
      created++;
    } catch (err: any) {
      // Unique constraint violation — skip duplicates silently
      if (err?.code === "P2002") {
        console.log(`  ⏭️  Duplicate skipped: ${listing.url}`);
      } else {
        console.error(`  ❌ DB error for ${listing.url}:`, err.message);
      }
    }
  }

  return created;
}

/**
 * Parse a price string like "AED 45,000 / Yearly" → 45000.0
 */
export function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  // Remove "AED", commas, "/ Yearly", "/ Monthly", etc.
  const cleaned = priceStr.replace(/AED\.?/gi, "").replace(/\/\s*(Yearly|Monthly|Daily)/i, "").replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ─── Lead Latency (PRD §4.1 — Derived Metric) ────────────────

/**
 * Calculate Lead Latency = createdAt - sourceListedAt
 * Returns latency in seconds, or null if sourceListedAt is not available.
 */
export function calculateLeadLatency(
  createdAt: Date,
  sourceListedAt: Date | null
): number | null {
  if (!sourceListedAt) return null;
  return Math.round((createdAt.getTime() - sourceListedAt.getTime()) / 1_000);
}

// ─── Telegram Notification (PRD §4.3 — The Messenger) ────────

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      }
    );
    if (!res.ok) {
      console.error(`  ❌ Telegram error (${res.status}): ${await res.text()}`);
      return false;
    }
    console.log("  📲 Telegram notification sent.");
    return true;
  } catch (err) {
    console.error("  ❌ Telegram fetch error:", (err as Error).message);
    return false;
  }
}

/**
 * Send Telegram notification for new listings.
 * Respects Shadow Mode (PRD §4.4):
 *   - "ALL" → notify for all new listings
 *   - "VERIFIED_ONLY" → only notify for listings with agentScore below threshold
 */
export async function notifyListings(
  listings: Array<Listing & { leadLatency: number | null }>,
  config: HunterConfig,
  notifyMode: string,
  agentThreshold: number
): Promise<string[]> {
  // Filter based on Shadow Mode
  const toNotify =
    notifyMode === "VERIFIED_ONLY"
      ? listings.filter((l) => l.agentScore < agentThreshold)
      : listings;

  if (toNotify.length === 0) return [];

  // Build message
  if (toNotify.length === 1) {
    const l = toNotify[0];
    const scoreEmoji =
      l.agentScore <= 30 ? "🟢" : l.agentScore <= 60 ? "🟡" : "🔴";
    const latencyBadge = l.leadLatency !== null ? `Detected in ${l.leadLatency}s` : "";

    const sent = await sendTelegram(
      config.telegramBotToken,
      config.telegramChatId,
      `🏠 <b>New Lead Detected!</b>\n\n` +
        `📝 <b>Title:</b> ${escapeHtml(l.title)}\n` +
        `💰 <b>Price:</b> AED ${l.price.toLocaleString()}\n` +
        `${l.phone ? `📞 <b>Phone:</b> ${escapeHtml(l.phone)}\n` : ""}` +
        `${l.phone ? `💬 <a href="https://wa.me/${l.phone.replace(/[^0-9]/g, "")}">WhatsApp</a>\n` : ""}` +
        `🔗 <b>Link:</b> ${l.url}\n\n` +
        `${scoreEmoji} <b>Agent Score:</b> ${l.agentScore}/100\n` +
        `${latencyBadge ? `⚡ ${latencyBadge}\n` : ""}` +
        `\n⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`
    );
    return sent ? [l.id] : [];
  }

  // Batch message
  const batch = toNotify.slice(0, 10); // Telegram message limit
  const lines = batch
    .map((l, i) => {
      const scoreEmoji =
        l.agentScore <= 30 ? "🟢" : l.agentScore <= 60 ? "🟡" : "🔴";
      return `${i + 1}. ${scoreEmoji} <a href="${l.url}">${escapeHtml(l.title)}</a> — AED ${l.price.toLocaleString()}`;
    })
    .join("\n");

  const sent = await sendTelegram(
    config.telegramBotToken,
    config.telegramChatId,
    `🏠 <b>${toNotify.length} New Leads!</b>\n\n` +
      lines +
      `\n\n⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`
  );
  return sent ? batch.map((l) => l.id) : [];
}

// ─── Scraping: Web Search Fallback ───────────────────────────

/**
 * Scrape listings using z-ai-web-dev-sdk web_search.
 * This is the primary method since Dubizzle blocks direct Playwright access.
 */
export async function scrapeWithWebSearch(): Promise<RawListing[]> {
  console.log("  → Web Search: querying…");
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const queries = [
    'site:dubai.dubizzle.com "direct from owner" apartment rent',
    'site:dubai.dubizzle.com/en/property-for-rent/residential/apartmentflat owner 2026',
    'dubai.dubizzle.com apartmentflat "direct from owner" AED yearly',
    'site:dubizzle.com "direct from owner" apartment flat rent dubai 2026',
  ];

  const allRaw: { url: string; name: string; snippet: string }[] = [];
  for (const q of queries) {
    try {
      const results = await zai.functions.invoke("web_search", {
        query: q,
        num: 15,
      });
      for (const r of results) {
        allRaw.push({
          url: r.url || "",
          name: r.name || "",
          snippet: r.snippet || "",
        });
      }
    } catch {
      /* skip failed queries */
    }
  }

  const listings: RawListing[] = [];
  const seenUrls = new Set<string>();

  for (const r of allRaw) {
    if (!r.url || !r.name) continue;
    if (!/\d{4}\/\d{1,2}\/\d{1,2}\//.test(r.url) || !r.url.includes("apartmentflat"))
      continue;

    let url = r.url.startsWith("http") ? r.url : `https://dubai.dubizzle.com${r.url}`;
    url = url
      .replace(/^https:\/\/www\.dubizzle\.com\//, "https://dubai.dubizzle.com/")
      .replace(/^https:\/\/uae\.dubizzle\.com\//, "https://dubai.dubizzle.com/");
    if (!url.includes("/en/")) {
      url = url.replace(
        "dubai.dubizzle.com/property-for-rent",
        "dubai.dubizzle.com/en/property-for-rent"
      );
    }

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let title = r.name
      // Remove trailing site branding
      .replace(/\s*[|–—]\s*(dubizzle|dubizzle Dubai|dubizzle Dubai Classifieds)\s*$/i, "")
      // Remove leading type prefix like "Apartment: " or "Apartment Flat: "
      .replace(/^(Apartment\s*Flat?|Studio|Villa|Townhouse|Penthouse)\s*:\s*/i, "")
      .trim();

    const price = extractPriceFromSnippet(r.snippet) || extractPriceFromTitle(title);

    // Try to extract source date from URL like /2026/3/28/
    const dateMatch = r.url.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
    let sourceListedAt: Date | undefined;
    if (dateMatch) {
      const [, y, m, d] = dateMatch.map(Number);
      sourceListedAt = new Date(y, m - 1, d);
    }

    listings.push({ title, url, price, source: "dubizzle", sourceListedAt });
  }

  return listings;
}

// ─── Price Extraction Helpers ─────────────────────────────────

function extractPriceFromSnippet(snippet: string): string {
  if (!snippet) return "";

  // Pattern 1: "AED 45,000 / Yearly" or "AED. 45,000 Yearly"
  let m = snippet.match(/AED\.?\s*([\d,]+(?:\.\d+)?)[.\s]*(Yearly|Monthly|Daily)?/i);
  if (m) return `AED ${m[1]}${m[2] ? ` / ${m[2]}` : ""}`;

  // Pattern 2: "45,000 Yearly" or "65000/Monthly"
  m = snippet.match(/([\d,]{4,})\s*[-/]?\s*(Yearly|Monthly|Daily)/i);
  if (m) return `AED ${m[1]} / ${m[2]}`;

  // Pattern 3: "AED 45,000" without period indicator
  m = snippet.match(/AED\s*([\d,]+)/i);
  if (m) return `AED ${m[1]}`;

  // Pattern 4: Bare number with currency context like "45000 AED"
  m = snippet.match(/([\d,]{4,})\s*AED/i);
  if (m) return `AED ${m[1]}`;

  return "";
}

function extractPriceFromTitle(title: string): string {
  if (!title) return "";

  // Pattern 1: "AED 45,000" in title
  let m = title.match(/AED\s*([\d,]+)/i);
  if (m) return `AED ${m[1]}`;

  // Pattern 2: Price in parentheses like "48000 (12 CHEQUES)" — common on Dubizzle
  m = title.match(/\b([\d,]{4,})\s*\(\d+\s*cheque/i);
  if (m) return `AED ${m[1]} / Yearly`;

  // Pattern 3: Bare number ≥4 digits likely to be AED price ("Studio | 48000 | JVC")
  m = title.match(/\|\s*([\d,]{4,})\s*\|/);
  if (m) return `AED ${m[1]}`;

  // Pattern 4: Price at end of title like "... 48000"
  m = title.match(/\s([\d,]{4,})\s*$/);
  if (m) return `AED ${m[1]}`;

  return "";
}

// ─── Main Hunter Cycle ───────────────────────────────────────

let cycleNumber = 0;

/**
 * Run a single Hunter cycle:
 * 1. Apply jitter delay
 * 2. Scrape listings
 * 3. Process through Brain (dedup, blacklist, agent scoring)
 * 4. Persist new listings to DB
 * 5. Send Telegram notifications
 */
export async function runHunterCycle(
  db: PrismaClient,
  config: HunterConfig,
  options: { enrich?: boolean; jitter?: boolean } = {}
): Promise<HunterResult> {
  cycleNumber++;
  const startedAt = new Date();
  const errors: string[] = [];

  console.log(
    `\n${"═".repeat(50)}\n` +
      `  🔄 Hunter Cycle #${cycleNumber} — ${startedAt.toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}\n` +
      `${"═".repeat(50)}`
  );

  // Step 1: Apply Jitter (PRD §4.1)
  const jitterDelayMs = options.jitter === false ? 0 : await applyJitter();

  // Step 2: Scrape Listings
  let rawListings: RawListing[] = [];
  try {
    rawListings = await scrapeWithWebSearch();
  } catch (err) {
    const msg = `Scraping failed: ${(err as Error).message}`;
    console.error(`  ❌ ${msg}`);
    errors.push(msg);
  }

  if (rawListings.length === 0) {
    console.log("  ❌ No listings found this cycle.");
    return {
      cycleNumber,
      totalScraped: 0,
      newListings: 0,
      duplicateSkipped: 0,
      blacklistedSkipped: 0,
      latencyMs: Date.now() - startedAt.getTime(),
      jitterDelayMs,
      errors,
    };
  }

  console.log(`  ✅ Scraped ${rawListings.length} listing(s).`);

  // Step 3: Process through Brain
  const adminSettings = await getAdminSettings(db);
  const brainResult = await processWithBrain(db, rawListings, adminSettings);

  console.log(
    `  🧠 Brain: ${brainResult.verified.length} verified, ${brainResult.duplicates.length} duplicates, ${brainResult.blacklisted.length} blacklisted`
  );

  // Step 4: Calculate Agent Scores for verified listings
  const blacklist = parseBlacklistKeywords(adminSettings?.blacklistKeywords);
  const agentScores = new Map<string, number>();

  for (const listing of brainResult.verified) {
    const score = await calculateAgentScore(db, listing, blacklist);
    agentScores.set(listing.url, score);
    const emoji = score <= 30 ? "🟢" : score <= 60 ? "🟡" : "🔴";
    console.log(
      `    ${emoji} ${listing.title.substring(0, 50)}… → score ${score}`
    );
  }

  // Step 5: Persist to DB
  const created = await persistListings(db, brainResult.verified, agentScores);
  console.log(`  💾 Persisted ${created} new listing(s).`);

  // Step 6: Send Telegram Notifications (respecting Shadow Mode)
  if (created > 0) {
    const newListingsFromDb = await db.listing.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: created,
    });

    const listingsWithLatency = newListingsFromDb.map((l) => ({
      ...l,
      leadLatency: calculateLeadLatency(l.createdAt, l.sourceListedAt),
    }));

    const notifiedIds = await notifyListings(
      listingsWithLatency,
      config,
      adminSettings?.notifyMode ?? "ALL",
      adminSettings?.agentThreshold ?? 60
    );

    // Only mark listings as SENT after Telegram confirms delivery.
    if (notifiedIds.length > 0) {
      await db.listing.updateMany({
        where: { id: { in: notifiedIds } },
        data: { status: "SENT" },
      });
    }
  }

  // Step 7: Enrich top leads with phone/price via web_search + LLM.
  if (options.enrich !== false) {
    enrichTopLeads(db, brainResult.verified, agentScores).catch((err) => {
      console.error("  ⚠️  Enrichment error (non-fatal):", (err as Error).message);
    });
  }

  const elapsed = ((Date.now() - startedAt.getTime()) / 1_000).toFixed(1);
  console.log(`  📊 Cycle #${cycleNumber} complete in ${elapsed}s`);

  return {
    cycleNumber,
    totalScraped: rawListings.length,
    newListings: created,
    duplicateSkipped: brainResult.duplicates.length,
    blacklistedSkipped: brainResult.blacklisted.length,
    latencyMs: Date.now() - startedAt.getTime(),
    jitterDelayMs,
    errors,
  };
}

// ─── Admin Settings Helper ────────────────────────────────────

/**
 * Get the first AdminSetting record, or create a default one if none exists.
 */
export async function getAdminSettings(db: PrismaClient): Promise<AdminSetting | null> {
  let settings = await db.adminSetting.findFirst();
  if (!settings) {
    settings = await db.adminSetting.create({
      data: {
        blacklistKeywords: JSON.stringify(["agent", "broker", "agency", "real estate", "property management"]),
        scrapeInterval: 10,
        notifyMode: "ALL",
        agentThreshold: 60,
      },
    });
  }
  return settings;
}

/**
 * Get the effective scrape interval from admin settings (in ms).
 */
export async function getScrapeIntervalMs(db: PrismaClient): Promise<number> {
  const settings = await getAdminSettings(db);
  return (settings?.scrapeInterval ?? 10) * 60 * 1_000;
}

// ─── Lead Enrichment (PRD §4.1 — phone extraction, price enrichment) ──

/**
 * Enrich top leads by using LLM to extract phone/price from search snippets.
 * Dubizzle's WAF blocks page_reader, so we use the LLM to parse the snippets
 * we already collected from web_search.
 * Runs async/non-blocking after the main cycle.
 */
export async function enrichTopLeads(
  db: PrismaClient,
  verifiedListings: RawListing[],
  agentScores: Map<string, number>
): Promise<void> {
  // Find listings that need enrichment (no phone or no price)
  const toEnrich = verifiedListings
    .filter((l) => !l.phone || parsePrice(l.price) === 0)
    .sort((a, b) => (agentScores.get(a.url) ?? 50) - (agentScores.get(b.url) ?? 50))
    .slice(0, 5);

  if (toEnrich.length === 0) return;

  console.log(`  🔍 Enriching ${toEnrich.length} lead(s) via web_search + LLM…`);

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  for (const listing of toEnrich) {
    try {
      // Search for the specific listing to get richer snippets
      const searchTitle = listing.title.substring(0, 60).replace(/[|–—]/g, " ").trim();
      const searchResults = await zai.functions.invoke("web_search", {
        query: `site:dubai.dubizzle.com "${searchTitle}"`,
        num: 3,
      });

      // Collect all snippets for this listing
      const snippets: string[] = [];
      for (const r of searchResults) {
        if (r.snippet) snippets.push(r.snippet);
        if (r.name) snippets.push(r.name);
      }

      if (snippets.length === 0) continue;

      // Use LLM to extract structured data from snippets
      const allText = snippets.join("\n");
      const completion = await zai.chat.completions.create({
        model: getZaiModel(),
        messages: [
          {
            role: "assistant",
            content: `You are a data extraction assistant for Dubai real estate listings. Extract ONLY the following fields from the given text:
- phone: UAE phone number in +971XXXXXXXXX format, or null
- price: numeric price in AED (just the number), or null
Respond with valid JSON only. No additional text. Example: {"phone": "+971501234567", "price": 48000}`,
          },
          {
            role: "user",
            content: `Extract phone and price from this listing data:\n\nTitle: ${listing.title}\nSnippets:\n${allText}`,
          },
        ],
        thinking: { type: "disabled" },
      });

      const response = completion.choices[0]?.message?.content || "";
      let extracted: any = {};
      try {
        // Try to parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        }
      } catch { /* skip parse errors */ }

      // Update the listing in DB
      const dbListing = await db.listing.findUnique({ where: { url: listing.url } });
      if (dbListing) {
        const updateData: any = {};

        if (extracted.phone && typeof extracted.phone === "string" && extracted.phone.startsWith("+971")) {
          updateData.phone = extracted.phone;
          console.log(`    📞 LLM extracted phone: ${extracted.phone}`);
        }

        if (extracted.price && typeof extracted.price === "number" && extracted.price > 0 && dbListing.price === 0) {
          updateData.price = extracted.price;
          console.log(`    💰 LLM extracted price: AED ${extracted.price.toLocaleString()}`);
        }

        if (Object.keys(updateData).length > 0) {
          await db.listing.update({
            where: { id: dbListing.id },
            data: updateData,
          });
        }
      }

      // Rate limit between LLM calls
      await sleep(1_000);
    } catch (err) {
      console.error(`    ❌ Enrichment error for ${listing.url}:`, (err as Error).message);
    }
  }
}

/**
 * Extract a UAE phone number from page text.
 * UAE formats: +971-XX-XXX-XXXX, +971XXXXXXXXX, 05X-XXX-XXXX, 05XXXXXXXX
 */
export function extractPhoneFromPage(text: string): string | null {
  // Pattern 1: +971XXXXXXXXX (most common on Dubizzle)
  let m = text.match(/\+971[\s-]?[5-7]\d[\s-]?\d{3}[\s-]?\d{4}/);
  if (m) return m[0].replace(/[\s-]/g, "");

  // Pattern 2: 05XXXXXXXX (local format)
  m = text.match(/05[0-9][\s-]?\d{3}[\s-]?\d{4}/);
  if (m) {
    const local = m[0].replace(/[\s-]/g, "");
    return `+971${local.substring(1)}`; // Convert to +971 format
  }

  // Pattern 3: +971 X XX XXX XXXX with spaces
  m = text.match(/\+971[\s]+[5-7]\d[\s]+\d{3}[\s]+\d{4}/);
  if (m) return m[0].replace(/\s/g, "");

  // Pattern 4: Phone label followed by number
  m = text.match(/(?:phone|mobile|call|tel|contact|whatsapp)[:\s]*[\+]?[9715-7][\d\s-]{8,15}/i);
  if (m) {
    const digits = m[0].replace(/[^\d+]/g, "");
    if (digits.length >= 10) return digits;
  }

  return null;
}

/**
 * Extract price from full page text (more data available than snippet).
 */
export function extractPriceFromPage(text: string): number {
  // Try AED patterns first
  let m = text.match(/AED\.?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  // Try "Price: XXXXX" pattern
  m = text.match(/price[:\s]*([\d,]{4,})/i);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  // Try "XXXXX / Yearly" pattern
  m = text.match(/([\d,]{4,})\s*\/\s*(Yearly|Monthly|Daily)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  return 0;
}

/**
 * Backfill enrichment for existing listings that lack phone/price data.
 * Uses LLM + web_search instead of page_reader (which is blocked by Dubizzle WAF).
 */
export async function backfillListings(db: PrismaClient): Promise<number> {
  console.log("  🔄 Backfill: enriching existing listings via LLM…");

  const listingsWithoutData = await db.listing.findMany({
    where: {
      OR: [
        { phone: null },
        { price: 0 },
      ],
    },
    orderBy: { agentScore: "asc" }, // Prioritize likely owners first
    take: 10,
  });

  if (listingsWithoutData.length === 0) {
    console.log("  ✅ Backfill: all listings already enriched.");
    return 0;
  }

  console.log(`  📋 Backfill: ${listingsWithoutData.length} listings need enrichment.`);

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  let enriched = 0;

  for (const listing of listingsWithoutData) {
    try {
      await sleep(1_500); // Rate limit

      // Search for richer snippets about this listing
      const searchTitle = listing.title.substring(0, 60).replace(/[|–—]/g, " ").trim();
      const searchResults = await zai.functions.invoke("web_search", {
        query: `site:dubizzle.com "${searchTitle}" AED`,
        num: 5,
      });

      const snippets: string[] = [];
      for (const r of searchResults) {
        if (r.snippet) snippets.push(r.snippet);
        if (r.name) snippets.push(r.name);
      }

      if (snippets.length === 0) continue;

      // LLM extraction
      const allText = snippets.join("\n");
      const completion = await zai.chat.completions.create({
        model: getZaiModel(),
        messages: [
          {
            role: "assistant",
            content: `You are a data extraction assistant for Dubai real estate listings. Extract ONLY the following fields from the given text:
- phone: UAE phone number in +971XXXXXXXXX format, or null if not found
- price: numeric price in AED (just the number, no commas), or null if not found
Respond with valid JSON only. No additional text. Example: {"phone": "+971501234567", "price": 48000}`,
          },
          {
            role: "user",
            content: `Extract phone and price from this listing data:\n\nTitle: ${listing.title}\nURL: ${listing.url}\nSnippets:\n${allText}`,
          },
        ],
        thinking: { type: "disabled" },
      });

      const response = completion.choices[0]?.message?.content || "";
      let extracted: any = {};
      try {
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        }
      } catch { /* skip */ }

      const updateData: any = {};
      if (extracted.phone && typeof extracted.phone === "string" && extracted.phone.startsWith("+971")) {
        updateData.phone = extracted.phone;
      }
      if (extracted.price && typeof extracted.price === "number" && extracted.price > 0 && listing.price === 0) {
        updateData.price = extracted.price;
      }

      if (Object.keys(updateData).length > 0) {
        await db.listing.update({
          where: { id: listing.id },
          data: updateData,
        });
        enriched++;
        console.log(
          `    ✅ ${listing.title.substring(0, 40)}… → phone=${updateData.phone ?? "—"}, price=${updateData.price ? `AED ${updateData.price.toLocaleString()}` : "—"}`
        );
      }
    } catch (err) {
      console.error(`    ❌ Backfill error: ${(err as Error).message}`);
    }
  }

  console.log(`  📊 Backfill: enriched ${enriched} listing(s).`);
  return enriched;
}
