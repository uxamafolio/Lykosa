# **PRD: Project Lykosa (v2.1) — Open SaaS Edition**

**Project Title:** Lykosa — AI-Powered Real Estate Lead Hunter  
**Framework:** Open SaaS (Wasp)  
**Target Market:** Dubai Real Estate Agents / Brokers / Investors

---

## **1\. Executive Summary**

Lykosa is a real-time lead intelligence platform designed to identify **direct-from-owner (DFO) property listings** across online sources in Dubai.

The system continuously scans marketplaces, filters high-intent opportunities, and delivers actionable alerts to agents within **\<60 seconds of detection**, enabling faster outreach and higher deal conversion.

**Core Value Proposition:**

“Be the first to contact property owners before competitors.”

---

## **2\. Framework Capabilities (The Open SaaS Advantage)**

Lykosa is built on Open SaaS (Wasp), leveraging:

* **Wasp Jobs (Background Workers):**  
  Reliable cron-based server-side execution for scraping automation  
* **Full-stack Authentication:**  
  Email \+ Google Auth pre-integrated  
* **End-to-End Type Safety:**  
  Error-free data flow between backend and frontend  
* **ShadCN UI Integration:**  
  Premium, modern UI components for dashboard

---

## **3\. Goals & Success Metrics**

### **3.1 Product Goals**

* Reduce lead discovery time from hours → seconds  
* Deliver high-quality, spam-filtered DFO leads  
* Provide a lightweight, scalable SaaS dashboard

---

### **3.2 Success Metrics (KPIs)**

* **Lead Delivery Latency:** \< 60 seconds  
* **Signal Accuracy (DFO detection):** \> 80%  
* **Duplicate Rate:** \< 5%  
* **Daily Active Users (DAU)**  
* **Lead → Contact Conversion Rate**

---

## **4\. Functional Requirements**

---

### **4.1 The Hunter (Lead Discovery Engine)**

**Description:** Automated scraping and ingestion system

---

#### **Core Capabilities**

* Playwright-based scraping engine  
* Runs every **10 minutes (configurable)**  
* Detects:  
  * Owner-listed properties  
  * New listings  
  * (Future) Price drops

---

#### **Adaptive Cron with Jitter (NEW)**

To avoid bot detection:

* Base interval: **10 minutes**  
* Jitter: **±15–45 seconds randomized delay**  
* Ensures non-deterministic scraping patterns

---

#### **Source Timestamp Capture (NEW)**

Each listing stores:

* `sourceListedAt` → Original listing time from portal  
* `createdAt` → Time Lykosa detected it

---

#### **Derived Metric**

* **Lead Latency \= createdAt – sourceListedAt**

---

#### **Persistence**

* Stored in PostgreSQL via Prisma  
* Duplicate prevention via unique URL constraint

---

---

### **4.2 The Brain (Filtering & Intelligence Layer)**

**Description:** Filters noise and identifies true owner listings

---

#### **Core Filtering**

* Keyword blacklist (e.g., “agent”, “broker”)  
* Duplicate URL filtering

---

#### **Behavior-Based Detection (NEW)**

##### **Phone-Based Agent Detection**

If a phone number:

* Appears in ≥5 listings  
* Within ≤2 minutes

→ Mark as likely agent

---

##### **Duplicate Intelligence**

* URL deduplication  
* Phone deduplication  
* Cross-listing clustering

---

##### **Agent Scoring System (NEW)**

Each listing assigned:

* `agentScore (0–100)`

**Example Logic:**

* \+40 → repeated phone  
* \+30 → keyword match  
* \+20 → high frequency posting  
* \-30 → owner-like signals

---

---

### **4.3 The Messenger (Integration Layer)**

**Description:** Real-time alert delivery system

---

#### **Channels**

* Telegram Bot (v1)  
* Future: WhatsApp, Email, Push

---

#### **Behavior**

* Instant alert on new lead detection  
* Includes:  
  * Title  
  * Price  
  * Location  
  * Link

---

---

### **4.4 The Admin Dashboard**

---

#### **Lead View**

* Real-time listing table  
* Filters:  
  * Date  
  * Price  
  * Keywords  
* Status tags:  
  * New  
  * Sent  
  * Ignored

---

#### **Control Center**

* Manage keyword blacklist  
* Configure scrape interval  
* Set agentScore threshold  
* Toggle notification mode

---

#### **One-Click WhatsApp (NEW)**

* Button opens direct chat with owner  
* Format: `https://wa.me/<phone>`

**Impact:**

* Eliminates friction  
* Enables instant outreach

---

#### **Shadow Mode (NEW)**

**Modes:**

1. **Notify All**  
   * All leads → Telegram  
2. **Notify Verified Only**  
   * Only low agentScore leads → Telegram

---

**Behavior:**

* Dashboard \= **Master Feed (all data)**  
* Telegram \= **Filtered signal feed**

---

## **5\. Technical Architecture (Wasp Structure)**

---

### **5.1 Stack Overview**

* **Frontend:** React (Wasp client)  
* **Backend:** Node.js (Wasp server)  
* **Database:** PostgreSQL \+ Prisma  
* **Automation:** Wasp Jobs (Cron workers)  
* **Deployment:** Railway / Fly.io

---

### **5.2 System Flow**

1. Cron job triggers scraper  
2. Jitter delay applied  
3. Scraper fetches listings  
4. Data enriched:  
   * phone extraction  
   * sourceListedAt  
5. Brain processes:  
   * deduplication  
   * agentScore calculation  
6. Data stored in PostgreSQL  
7. Listings categorized:  
   * Verified  
   * Unverified  
8. Notification logic applied  
9. Telegram alerts sent (based on mode)

---

### **5.3 Data Models (Prisma)**

model User {  
  id        String @id @default(uuid())  
  email     String @unique  
  createdAt DateTime @default(now())  
}

model Listing {  
  id              String   @id @default(uuid())  
  title           String  
  price           Float  
  url             String   @unique  
  source          String

  phone           String?  
  agentScore      Int      @default(0)

  sourceListedAt  DateTime?  
  createdAt       DateTime @default(now())

  @@index(\[phone\])  
}

model AdminSetting {  
  id                String  @id @default(uuid())  
  blacklistKeywords String\[\]  
  scrapeInterval    Int

  notifyMode        String  // "ALL" | "VERIFIED\_ONLY"  
  agentThreshold    Int  
}

---

## **6\. UI/UX Style Guide (Lykosa Vibe)**

---

### **Theme**

* Dark Mode (Slate-950)

### **Accent**

* Electric Lime (\#BEF264)

---

### **Layout**

* Sidebar-based dashboard  
* Glassmorphism cards  
* Data-first tables

---

### **UX Principles**

* Speed \> aesthetics  
* Zero friction  
* One-click actions

---

### **Signal Visualization (NEW)**

#### **Agent Score Colors**

* 🟢 0–30 → Likely Owner  
* 🟡 31–60 → Uncertain  
* 🔴 61–100 → Likely Agent

---

#### **Latency Badge (NEW)**

* Display: “Detected in 42s”

---

## **7\. Non-Functional Requirements**

* **Performance:** Handle concurrent scraping  
* **Reliability:** Retry failed jobs  
* **Scalability:** Multi-user ready  
* **Security:** Auth-protected system

---

## **8\. Risks & Constraints**

---

### **Risks**

* Anti-scraping protections  
* IP blocking / CAPTCHA  
* Data inconsistency

---

### **Mitigation**

* Proxy rotation  
* Rate limiting  
* Jittered execution  
* Multi-source fallback

---

## **9\. Roadmap**

---

### **v1 (MVP)**

* Single-source scraping  
* Telegram alerts  
* Admin dashboard  
* Keyword filtering

---

### **v1.5**

* Multi-source scraping  
* Improved filtering  
* Lead tagging

---

### **v2**

* AI-based DFO detection  
* Predictive scoring  
* CRM integrations

---

## **10\. Future Opportunities**

* SaaS subscription tiers  
* Agency API access  
* White-label solutions