"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ParsedTransaction } from "@/lib/parse";

function buildFingerprint(accountId: string, tx: ParsedTransaction): string {
  return [
    accountId,
    tx.bookingDateISO,
    tx.valueDateISO,
    tx.amount.toFixed(2),
    tx.description.trim().toLowerCase(),
    tx.memoRaw.trim().toLowerCase(),
  ].join("|");
}

export async function createImportedTransactions(accountId: string, parsedTransactions: ParsedTransaction[]) {
  if (!accountId) {
    throw new Error("Konto ist erforderlich.");
  }

  if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
    throw new Error("Keine Buchungen zum Import vorhanden.");
  }

  const rows = parsedTransactions.map((tx) => ({
    accountId,
    bookingDate: new Date(tx.bookingDateISO),
    valueDate: new Date(tx.valueDateISO),
    amount: tx.amount,
    description: tx.description,
    memoRaw: tx.memoRaw,
    counterparty: tx.description,
    purpose: tx.memoRaw,
    fingerprint: buildFingerprint(accountId, tx),
    source: "import-workbench",
  }));

  await prisma.transaction.createMany({
    data: rows,
  });

  revalidatePath("/");

  return { importedCount: rows.length };
}
