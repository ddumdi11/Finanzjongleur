-- CreateTable
CREATE TABLE "RecurringPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expectedAmount" DECIMAL NOT NULL,
    "amountTolerance" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "periodicity" TEXT NOT NULL,
    "intervalDays" INTEGER,
    "dayOfMonth" INTEGER,
    "anchorDate" DATETIME NOT NULL,
    "merchantKey" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextExpectedDate" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" INTEGER,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecurringPayment_accountId_isActive_idx" ON "RecurringPayment"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "RecurringPayment_nextExpectedDate_idx" ON "RecurringPayment"("nextExpectedDate");
