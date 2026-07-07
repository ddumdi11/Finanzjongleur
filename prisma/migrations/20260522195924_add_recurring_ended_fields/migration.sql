-- AlterTable
ALTER TABLE "RecurringPayment" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "RecurringPayment" ADD COLUMN "endedAt" DATETIME;
ALTER TABLE "RecurringPayment" ADD COLUMN "endNote" TEXT;
ALTER TABLE "RecurringPayment" ADD COLUMN "endReason" TEXT;

-- CreateIndex
CREATE INDEX "RecurringPayment_endedAt_idx" ON "RecurringPayment"("endedAt");
