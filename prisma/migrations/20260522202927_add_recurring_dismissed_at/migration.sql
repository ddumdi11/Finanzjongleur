-- AlterTable
ALTER TABLE "RecurringPayment" ADD COLUMN "dismissedAt" DATETIME;

-- CreateIndex
CREATE INDEX "RecurringPayment_dismissedAt_idx" ON "RecurringPayment"("dismissedAt");
