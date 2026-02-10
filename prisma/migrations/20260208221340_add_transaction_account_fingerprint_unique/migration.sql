-- DropIndex
DROP INDEX "Transaction_accountId_fingerprint_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_fingerprint_key" ON "Transaction"("accountId", "fingerprint");
