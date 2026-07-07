/**
 * Parser fuer bunq-CSV-Exports.
 *
 * Format (Semikolon-separiert, alle Felder in Anfuehrungszeichen):
 *   "Date";"Interest Date";"Amount";"Counterparty";"Name";"Description"
 *   "2024-07-02";"2024-07-02";"0,05";"NL13BUNQ2094122549";"bunq";"bunq Payday 2024-07-02 EUR"
 *
 * Eigenheiten:
 *  - Date-Format ist ISO (YYYY-MM-DD), also kein Jahr-Raten noetig
 *  - Amount mit deutschem Komma-Dezimal ("0,05", "-22,13")
 *  - Counterparty ist die IBAN der Gegenseite, bei Kartenzahlungen leer
 *  - "Name" ist der Haendler-Name — den nehmen wir direkt als merchantKey
 *  - "Description" ist freier Verwendungszweck, bei Fremdwaehrungs-Buchungen
 *    inkl. Original-Betrag und Wechselkurs
 */
import type { ParsedTransaction } from "./parse";
import { normalizeMerchant } from "./merchant";

/** Erwartete Spalten der bunq-CSV in genau dieser Reihenfolge. */
const EXPECTED_COLUMNS = [
  "date",
  "interest date",
  "amount",
  "counterparty",
  "name",
  "description",
] as const;

/**
 * Parser einer CSV-Zeile mit RFC-4180-aehnlichem Verhalten:
 * Semikolon-getrennt, Werte optional in doppelten Anfuehrungszeichen,
 * Doppel-Quote `""` innerhalb eines gequoteten Feldes wird als ein `"`
 * dekodiert.
 */
export function parseCsvRow(line: string, separator = ";"): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
      } else {
        current += ch;
        i += 1;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === separator) {
        result.push(current);
        current = "";
        i += 1;
      } else {
        current += ch;
        i += 1;
      }
    }
  }
  result.push(current);
  return result;
}

/** Erkennt, ob ein Text wie ein bunq-CSV-Export aussieht. */
export function looksLikeBunqCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return false;
  const header = parseCsvRow(firstLine).map((h) => h.trim().toLowerCase());
  if (header.length < EXPECTED_COLUMNS.length) return false;
  return EXPECTED_COLUMNS.every((col, idx) => header[idx] === col);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseGermanAmount(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const cleaned =
    trimmed.includes(".") && trimmed.includes(",")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");
  return Number(cleaned);
}

/**
 * Parst eine bunq-CSV zu ParsedTransaction-Instanzen.
 * Zeilen mit ungueltigen Datums- oder Betrags-Feldern werden uebersprungen.
 */
export function parseBunqCsv(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/);
  const nonEmpty: string[] = [];
  for (const line of lines) {
    if (line.trim().length > 0) nonEmpty.push(line);
  }
  if (nonEmpty.length === 0) return [];

  const header = parseCsvRow(nonEmpty[0]).map((h) => h.trim().toLowerCase());
  const idx = (col: (typeof EXPECTED_COLUMNS)[number]) => header.indexOf(col);
  const dateIdx = idx("date");
  const interestIdx = idx("interest date");
  const amountIdx = idx("amount");
  const nameIdx = idx("name");
  const descIdx = idx("description");
  if ([dateIdx, interestIdx, amountIdx, nameIdx, descIdx].some((i) => i < 0)) {
    return [];
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const row = parseCsvRow(nonEmpty[i]);
    if (row.length <= Math.max(dateIdx, interestIdx, amountIdx, nameIdx, descIdx)) {
      continue;
    }

    const date = (row[dateIdx] ?? "").trim();
    const interestDate = (row[interestIdx] ?? "").trim();
    const amountRaw = (row[amountIdx] ?? "").trim();
    const name = (row[nameIdx] ?? "").trim();
    const description = (row[descIdx] ?? "").trim();

    if (!isIsoDate(date) || !isIsoDate(interestDate)) continue;

    const amount = parseGermanAmount(amountRaw);
    if (!Number.isFinite(amount)) continue;

    const merchantKey = normalizeMerchant(name) || undefined;

    transactions.push({
      bookingDateISO: date,
      valueDateISO: interestDate,
      description: name || "bunq-Buchung",
      amount,
      memoRaw: description,
      merchantKey,
    });
  }
  return transactions;
}
