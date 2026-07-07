"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ParsedTransaction } from "@/lib/parse";
import { extractPdfText } from "@/lib/pdf";
import { deriveTransactionMerchantKey } from "@/lib/merchant";

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

export type ImportResult = {
  importedCount: number;
  skippedCount: number;
  totalCount: number;
};

export async function createImportedTransactions(
  accountId: string,
  parsedTransactions: ParsedTransaction[],
): Promise<ImportResult> {
  if (!accountId) {
    throw new Error("Konto ist erforderlich.");
  }

  if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
    throw new Error("Keine Buchungen zum Import vorhanden.");
  }

  // Fachlich idempotenter Import gemäß ADR 0002:
  // Wir legen jede Transaktion einzeln an. Verletzt der Insert die
  // Unique-Constraint (accountId, fingerprint), werten wir das als Duplikat
  // und zählen es unter `skippedCount` statt den Import abzubrechen.
  //
  // Zusätzlich: merchantKey wird aus der ersten Memo-Zeile abgeleitet,
  // und falls eine MerchantRule dafür existiert, wird die Kategorie gleich
  // beim Import vorbelegt. So greifen deine bestehenden Kategorisierungen
  // direkt auf neu importierte Buchungen.
  let imported = 0;
  let skipped = 0;

  // Regeln einmal laden und als Map bereitstellen — vermeidet N Queries
  // pro Import-Row.
  const rules = await prisma.merchantRule.findMany({
    select: { pattern: true, category: true, merchantName: true },
  });
  const ruleByPattern = new Map(rules.map((r) => [r.pattern, r]));

  for (const tx of parsedTransactions) {
    // Parser-spezifischer merchantKey hat Vorrang (z. B. bunq liefert
    // den Haendler sauber im Name-Feld). Ansonsten aus der ersten
    // Memo-Zeile ableiten (Volksbank-Fall).
    const merchantKey = tx.merchantKey ?? deriveTransactionMerchantKey(tx.memoRaw);
    const matchingRule = merchantKey ? ruleByPattern.get(merchantKey) : undefined;

    try {
      await prisma.transaction.create({
        data: {
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
          merchantKey,
          merchantName: matchingRule?.merchantName ?? null,
          category: matchingRule?.category ?? null,
        },
      });
      imported += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  return {
    importedCount: imported,
    skippedCount: skipped,
    totalCount: parsedTransactions.length,
  };
}

export type ExtractPdfTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Extrahiert den Textinhalt einer hochgeladenen PDF-Datei serverseitig.
 * Das Ergebnis wird anschließend clientseitig durch `parseVolksbankPaste`
 * gefüttert — also derselbe Pfad, als hätte der User den Text per
 * Copy/Paste eingefügt.
 */
export async function extractPdfTextAction(formData: FormData): Promise<ExtractPdfTextResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Keine Datei übergeben." };
  }

  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return { ok: false, error: "Nur PDF-Dateien werden unterstützt." };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await extractPdfText(bytes);
    if (!text.trim()) {
      return { ok: false, error: "PDF enthält keinen extrahierbaren Text." };
    }
    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF-Extraktion fehlgeschlagen.";
    return { ok: false, error: message };
  }
}

