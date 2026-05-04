CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'dubizzle',
    "phone" TEXT,
    "agentScore" INTEGER NOT NULL DEFAULT 0,
    "sourceListedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSetting" (
    "id" TEXT NOT NULL,
    "blacklistKeywords" TEXT NOT NULL DEFAULT '[]',
    "scrapeInterval" INTEGER NOT NULL DEFAULT 10,
    "notifyMode" TEXT NOT NULL DEFAULT 'ALL',
    "agentThreshold" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Listing_url_key" ON "Listing"("url");
CREATE INDEX "Listing_phone_idx" ON "Listing"("phone");
CREATE INDEX "Listing_agentScore_idx" ON "Listing"("agentScore");
CREATE INDEX "Listing_status_idx" ON "Listing"("status");
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");
