"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedTransaction } from "@/lib/parse";
import { normalizeMerchant } from "@/lib/merchant";

function extractReference(memoRaw: string, key: "CRED" | "MREF"): string {
  const pattern = new RegExp(`\\b${key}\\b[:\\s-]*([A-Za-z0-9_/.-]{4,})`, "i");
  const match = memoRaw.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function buildFingerprint(accountId: string, tx: ParsedTransaction): string {
  const valueDate = new Date(tx.valueDateISO);
  const valueDatePart = valueDate.toISOString().slice(0, 10);
  const amountPart = tx.amount.toFixed(2);
  const cred = extractReference(tx.memoRaw, "CRED");
  const mref = extractReference(tx.memoRaw, "MREF");
  const normalizedMerchantName = normalizeMerchant(`${tx.description}\n${tx.memoRaw}`)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const stableCounterparty = cred || normalizedMerchantName;
  const payload = [accountId, valueDatePart, amountPart, stableCounterparty, mref].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export async function createImportedTransactions(accountId: string, parsedTransactions: ParsedTransaction[]) {
  if (!accountId) {
    return { importedCount: 0, error: "Konto ist erforderlich." };
  }

  if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
    return { importedCount: 0, error: "Keine Buchungen zum Import vorhanden." };
  }

  const rows: Prisma.TransactionCreateManyInput[] = [];

  for (const tx of parsedTransactions) {
    if (typeof tx.bookingDateISO !== "string" || tx.bookingDateISO.trim().length === 0) {
      return { importedCount: 0, error: "Ungültiges Datum: bookingDateISO ist leer." };
    }

    if (typeof tx.valueDateISO !== "string" || tx.valueDateISO.trim().length === 0) {
      return { importedCount: 0, error: "Ungültiges Datum: valueDateISO ist leer." };
    }

    const bookingDate = new Date(tx.bookingDateISO);
    if (Number.isNaN(bookingDate.getTime())) {
      return { importedCount: 0, error: `Ungültiges Datum: bookingDateISO=${tx.bookingDateISO}` };
    }

    const valueDate = new Date(tx.valueDateISO);
    if (Number.isNaN(valueDate.getTime())) {
      return { importedCount: 0, error: `Ungültiges Datum: valueDateISO=${tx.valueDateISO}` };
    }

    const merchantKey = normalizeMerchant(`${tx.description}\n${tx.memoRaw}`)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const matchingRule = merchantKey
      ? await prisma.merchantRule.findFirst({
          where: { pattern: merchantKey },
          orderBy: { confidence: "desc" },
        })
      : null;

    rows.push({
      accountId,
      bookingDate,
      valueDate,
      amount: tx.amount,
      description: tx.description,
      memoRaw: tx.memoRaw,
      category: matchingRule?.category,
      merchantName: matchingRule?.merchantName,
      merchantKey: merchantKey || null,
      counterparty: tx.description,
      purpose: tx.memoRaw,
      fingerprint: buildFingerprint(accountId, tx),
      source: "import-workbench",
    });
  }

  let importedCount = 0;

  for (const row of rows) {
    try {
      await prisma.transaction.create({
        data: row,
      });
      importedCount += 1;
    } catch (error) {
      const prismaCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;

      if (prismaCode === "P2002") {
        continue;
      }

      console.error("Import row insert failed", error);
      return { importedCount: 0, error: "Import fehlgeschlagen. Bitte erneut versuchen." };
    }
  }

  revalidatePath("/");

  return { importedCount };
}
