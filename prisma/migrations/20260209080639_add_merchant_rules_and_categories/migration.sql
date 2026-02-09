-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "category" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "merchantKey" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "merchantName" TEXT;

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MerchantRule_pattern_idx" ON "MerchantRule"("pattern");
