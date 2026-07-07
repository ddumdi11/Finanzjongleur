/**
 * Parser fuer PayPal-CSV-Exports (deutschsprachige Variante).
 *
 * Format (Komma-getrennt, alle Felder in Anfuehrungszeichen):
 *   "Datum","Uhrzeit","Zeitzone","Beschreibung","Waehrung","Brutto",
 *   "Entgelt","Netto","Guthaben","Transaktionscode","Absender E-Mail-Adresse",
 *   "Name","Name der Bank","Bankkonto","Versand- und Bearbeitungsgebuehr",
 *   "Umsatzsteuer","Rechnungsnummer","Zugehoeriger Transaktionscode"
 *
 * Besonderheit: Jede Zahlung erscheint als PAAR aus zwei Zeilen —
 * die eigentliche Zahlung (Name gefuellt) plus eine interne
 * "Bankgutschrift auf PayPal-Konto", die das PayPal-Guthaben wieder auf
 * Null bringt, indem der Betrag vom verknuepften Bankkonto gezogen wird.
 * Wuerden wir beide importieren, waere jede Transaktion doppelt in der
 * DB und saldoneutral. Wir skippen darum die internen Gegenbuchungen
 * anhand der `Beschreibung`.
 *
 * Ebenfalls geskippt: "Allgemeine Waehrungsumrechnung"-Zeilen bei
 * USD-Abbuchungen etc. — die sind Support-Eintraege fuer die eigentliche
 * Fremdwaehrungs-Zahlung, die separat als eigene Zeile mit EUR-Brutto
 * vorkommt.
 */
import type { ParsedTransaction } from "./parse";
import { normalizeMerchant } from "./merchant";
import { parseCsvRow } from "./parse-bunq";

/**
 * Beschreibungen, die PayPal-interne Stuetzbuchungen markieren und
 * nicht als eigenstaendige Transaktionen importiert werden sollen.
 */
const INTERNAL_DESCRIPTIONS = new Set<string>([
  "bankgutschrift auf paypal-konto",
  "allgemeine währungsumrechnung",
  "allgemeine waehrungsumrechnung",
]);

/** Erkennt, ob ein Text wie ein PayPal-CSV-Export aussieht. */
export function looksLikePaypalCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return false;
  const header = parseCsvRow(firstLine, ",").map((h) => h.trim().toLowerCase());
  return (
    header.includes("datum") &&
    header.includes("brutto") &&
    header.includes("transaktionscode") &&
    header.includes("beschreibung")
  );
}

function parseGermanDateToIso(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2099) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseGermanAmountNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const cleaned =
    trimmed.includes(".") && trimmed.includes(",")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");
  return Number(cleaned);
}

/**
 * Parst eine PayPal-CSV zu ParsedTransaction-Instanzen.
 * Interne Stuetzbuchungen werden uebersprungen; Zeilen mit ungueltigem
 * Datums- oder Betrags-Feld ebenfalls.
 */
export function parsePaypalCsv(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvRow(lines[0], ",").map((h) => h.trim().toLowerCase());
  const idx = (col: string) => header.indexOf(col);
  const datumIdx = idx("datum");
  const beschreibungIdx = idx("beschreibung");
  const bruttoIdx = idx("brutto");
  const nameIdx = idx("name");
  const emailIdx = idx("absender e-mail-adresse");
  const txCodeIdx = idx("transaktionscode");
  const rechnungsIdx = idx("rechnungsnummer");

  if ([datumIdx, beschreibungIdx, bruttoIdx, nameIdx].some((i) => i < 0)) {
    return [];
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i], ",");
    if (row.length <= Math.max(datumIdx, beschreibungIdx, bruttoIdx, nameIdx)) {
      continue;
    }

    const datum = (row[datumIdx] ?? "").trim();
    const beschreibung = (row[beschreibungIdx] ?? "").trim();
    const bruttoRaw = (row[bruttoIdx] ?? "").trim();
    const name = (row[nameIdx] ?? "").trim();
    const email = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : "";
    const txCode = txCodeIdx >= 0 ? (row[txCodeIdx] ?? "").trim() : "";
    const rechnung = rechnungsIdx >= 0 ? (row[rechnungsIdx] ?? "").trim() : "";

    if (INTERNAL_DESCRIPTIONS.has(beschreibung.toLowerCase())) continue;

    const isoDate = parseGermanDateToIso(datum);
    if (!isoDate) continue;

    const amount = parseGermanAmountNumber(bruttoRaw);
    if (!Number.isFinite(amount)) continue;

    // description: wenn Name gesetzt ist (echter Haendler), diesen nehmen;
    // sonst Beschreibung (typisch fuer Fees wie "Ruecklastschriftgebuehr").
    const description = name || beschreibung || "PayPal-Buchung";
    const merchantSource = name || beschreibung;
    const merchantKey = normalizeMerchant(merchantSource) || undefined;

    // memoRaw: sinnvolle Zusatzinfo zusammenstellen, ohne die
    // description noch einmal zu doppeln.
    const memoParts: string[] = [];
    if (name && beschreibung) memoParts.push(beschreibung);
    if (email) memoParts.push(email);
    if (rechnung) memoParts.push(`Rechnung ${rechnung}`);
    if (txCode) memoParts.push(`TX ${txCode}`);
    const memoRaw = memoParts.join("\n");

    transactions.push({
      bookingDateISO: isoDate,
      valueDateISO: isoDate,
      description,
      amount,
      memoRaw,
      merchantKey,
    });
  }
  return transactions;
}
