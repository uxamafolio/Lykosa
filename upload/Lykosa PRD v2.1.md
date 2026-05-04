# **PRD: Project Lykosa (v2.0) — Open SaaS Edition**

**Product:** Lykosa — AI-Powered Real Estate Lead Hunter  
**Framework:** Open SaaS (Wasp)  
**Target Market:** Dubai Real Estate Agents / Brokers / Investors

---

## **1\. Executive Summary**

Lykosa is a real-time lead intelligence platform designed to identify **direct-from-owner (DFO) property listings** across online sources in Dubai.

The system continuously scans marketplaces, filters high-intent opportunities, and delivers actionable alerts to agents within **\<60 seconds of detection**, enabling faster outreach and higher deal conversion.

**Core Value Proposition:**

“Be the first to contact property owners before competitors.”

---

## **2\. Goals & Success Metrics**

### **2.1 Product Goals**

* Reduce lead discovery time from hours → seconds  
* Deliver high-quality, spam-filtered DFO leads  
* Provide a lightweight, scalable SaaS dashboard

### **2.2 Success Metrics (KPIs)**

* **Lead Delivery Latency:** \< 60 seconds  
* **Signal Accuracy (DFO detection):** \> 80%  
* **Duplicate Rate:** \< 5%  
* **Daily Active Users (DAU)**  
* **Conversion Rate (Lead → Contact)**

---

## **3\. Target Users**

### **Primary Users**

* Real estate brokers in Dubai  
* Property investment firms  
* Freelance agents hunting off-market deals

### **User Pain Points**

* Leads arrive too late  
* Listings flooded with agents already  
* Manual searching is time-consuming  
* No centralized filtering system

---

## **4\. Product Features**

### **4.1 The Hunter (Lead Discovery Engine)**

**Description:** Automated scraping and filtering system

**Capabilities:**

* Playwright-based scraping engine  
* Runs every **10 minutes (configurable)**  
* Detects:  
  * Owner-listed properties  
  * New listings  
  * Price drops (future scope)

**Tech Implementation:**

* Powered by **Wasp Jobs (Cron Workers)**  
* Server-side execution (no client dependency)

---

### **4.2 The Brain (Filtering & Intelligence Layer)**

**Description:** Ensures only relevant leads are delivered

**Features:**

* Keyword blacklist (e.g., “agent”, “broker”)  
* Duplicate detection via database constraints  
* Basic rule-based filtering (v1)  
* Future: AI/NLP classification for DFO detection

---

### **4.3 The Messenger (Alert System)**

**Description:** Real-time delivery of leads

**Channels:**

* Telegram Bot (v1)  
* Future: WhatsApp, Email, Push notifications

**Behavior:**

* Instant alert on new lead detection  
* Includes:  
  * Title  
  * Price  
  * Location  
  * Direct link

---

### **4.4 Admin Dashboard**

#### **Lead View**

* Real-time table of scraped listings  
* Filters (date, price, keyword)  
* Status tags (new, sent, ignored)

#### **Control Center**

* Manage keyword blacklist  
* Toggle scraping sources  
* Configure alert preferences

---

## **5\. Technical Architecture**

### **5.1 Stack Overview**

* **Frontend:** React (Wasp client)  
* **Backend:** Node.js (Wasp server)  
* **Database:** PostgreSQL \+ Prisma ORM  
* **Automation:** Wasp Jobs (Cron-based workers)  
* **Deployment:** Railway / Fly.io

---

### **5.2 System Flow**

1. Cron job triggers scraper  
2. Scraper fetches listings  
3. Data processed & filtered  
4. Stored in PostgreSQL  
5. New leads trigger alert action  
6. Telegram notification sent

---

### **5.3 Data Models**

* **User**  
* **Listing**  
  * title  
  * price  
  * source  
  * url  
  * createdAt  
* **AdminSetting**  
  * blacklistKeywords  
  * scrapeInterval

---

## **6\. Open SaaS (Wasp) Advantages**

* **Background Jobs:** Native cron system (no external scheduler needed)  
* **Auth Ready:** Email \+ Google login out of the box  
* **Type Safety:** End-to-end typed API  
* **Full-Stack in One Repo:** Faster development cycles  
* **UI Ready:** ShadCN components for premium UI

---

## **7\. UI/UX Guidelines (Lykosa Vibe)**

### **Design Language**

* **Theme:** Dark Mode (Slate-950)  
* **Accent:** Electric Lime (\#BEF264)  
* **Style:** Minimal \+ glassmorphism

### **Layout**

* Sidebar navigation  
* Card-based data panels  
* Dense, data-first tables

### **UX Principles**

* Speed \> aesthetics  
* Zero clutter  
* One-click actions

---

## **8\. Non-Functional Requirements**

* **Performance:** Scraper must handle concurrent sources  
* **Reliability:** Jobs must retry on failure  
* **Scalability:** Multi-user support without lag  
* **Security:** Auth-protected dashboard

---

## **9\. Risks & Constraints**

### **Risks**

* Website anti-scraping mechanisms  
* IP blocking / CAPTCHAs  
* Data quality inconsistencies

### **Mitigation**

* Proxy rotation  
* Rate limiting  
* Fallback scraping strategies

---

## **10\. Roadmap**

### **v1 (MVP)**

* Single-source scraping  
* Telegram alerts  
* Admin dashboard  
* Keyword filtering

### **v1.5**

* Multi-source scraping  
* Better filtering rules  
* Lead tagging system

### **v2**

* AI-based DFO detection  
* Predictive lead scoring  
* CRM integrations

---

## **11\. Future Opportunities**

* Subscription tiers (SaaS monetization)  
* API access for agencies  
* White-label version for brokerages

