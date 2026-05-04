# Lykosa Worklog

---
Task ID: 1
Agent: Main
Task: Implement Data Models and Background Job Foundation per PRD v2.1

Work Log:
- Read and analyzed Lykosa PRD v2.1 from uploaded file
- Updated prisma/schema.prisma with User, Listing, AdminSetting models adapted for SQLite
  - Replaced @default(uuid()) with @default(cuid()) for SQLite compatibility
  - Replaced String[] with JSON-encoded String for blacklistKeywords
  - Added status field to Listing ("NEW" | "SENT" | "IGNORED")
  - Added indexes on phone, agentScore, status, createdAt
- Ran db:push to apply schema changes
- Created src/server/workers/hunter.ts with full PRD logic:
  - Jitter logic: ±15-45s randomized delay (calculateJitterDelayMs, applyJitter)
  - Agent Scoring System: +40 repeated phone, +30 keyword match, +20 high frequency, -30 owner signals
  - Phone-Based Agent Detection: ≥5 listings with same phone in ≤2 minutes
  - Brain processing: URL dedup + keyword blacklist + agent scoring
  - Lead Latency calculation: createdAt - sourceListedAt
  - Web Search scraping via z-ai-web-dev-sdk
  - Telegram notifications with Shadow Mode support
  - Database persistence via Prisma
- Rewrote mini-services/dubizzle-monitor/index.ts to v2.0:
  - Uses Prisma DB instead of seen_listings.json
  - Imports hunter worker module
  - Configurable interval from admin settings
  - Health check endpoint on port 3010 with full status JSON
  - Graceful shutdown with DB disconnect
- Created API routes:
  - GET /api/listings (with filters: status, search, agentScore range, pagination)
  - PATCH /api/listings/[id] (update status, agentScore, phone)
  - GET/PUT /api/admin-settings (manage admin settings)
  - GET /api/hunter (proxy to mini-service health check)
- Built Lykosa Dashboard UI (page.tsx):
  - Dark theme (Slate-950 background, Electric Lime #BEF264 accent)
  - Three tabs: Leads, Control, Hunter
  - Stats bar: Total Leads, New, Likely Owner, Likely Agent
  - Leads table with agent score colors, latency badges, WhatsApp links, status badges
  - Control Center: keyword blacklist, scrape interval, shadow mode toggle, agent threshold
  - Hunter tab: service status, last cycle details, lifetime stats
  - Custom dark CSS theme variables
- Started mini-service and verified end-to-end flow
  - First cycle completed: 15 scraped → 4 verified → 4 persisted → Telegram sent

Stage Summary:
- All PRD §5.3 data models implemented in schema.prisma (SQLite-adapted)
- Hunter worker with Jitter + Agent Scoring fully functional
- Background service running on port 3010 with 10-min cron + jitter
- Dashboard UI live at http://localhost:3000 with dark theme
- 24 listings in database, 4 from first automated cycle
- Telegram notifications working

---
Task ID: 8-13
Agent: Main
Task: Data quality improvements — price extraction, title cleaning, agent scoring, enrichment

Work Log:
- Fixed price extraction — all 34 listings had price=0
  - Added 4 new regex patterns for snippet extraction (AED, bare numbers, currency context)
  - Added 4 new patterns for title extraction (cheques, pipe-delimited, trailing numbers)
  - Now extracting prices like "48000 (12 CHEQUES)" → AED 48,000
- Improved title cleaning
  - Strip "Apartment: " / "Studio: " / "Villa: " prefixes
  - Strip trailing " - dubizzle Dubai Classifieds" suffixes
- Enhanced agent scoring with title-based patterns (not just phone-dependent)
  - +15: Agent title heuristics (call now, best price, multiple units, view now)
  - -15: Weak owner signals (cheque, cheques, no deposit, flexible payment)
  - Added "direct owner", "landlord direct" to owner signals list
- Added sourceListedAt extraction from URL date paths (/2026/3/28/)
- Added lead enrichment system using LLM + web_search
  - Dubizzle's WAF blocks page_reader, so we use LLM to extract phone/price from search snippets
  - Auto-enrichment runs for top 5 leads per cycle (async, non-blocking)
  - Backfill endpoint POST /api/listings/backfill for manual enrichment
- Added "Enrich Now" button to Hunter tab in dashboard
- Ran backfill: enriched 10 listings with prices
  - Prices now range from AED 44,995 to AED 160,000
  - Phone extraction limited (Dubizzle snippets don't include phone numbers)

Stage Summary:
- Price extraction working: 10/34 listings now have prices via LLM enrichment
- Title cleaning removing property type prefixes and site branding
- Agent scoring enhanced with title pattern heuristics and weak owner signals
- LLM-based enrichment pipeline operational (auto + manual)
- 34 total listings, hunter running 10-min cycles with jitter
