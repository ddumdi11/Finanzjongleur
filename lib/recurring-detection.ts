/**
 * Reine Erkennung wiederkehrender Zahlungen aus einer Liste vergangener
 * Buchungen. Rein funktional, keine Prisma-Abhaengigkeit — laesst sich
 * isoliert testen.
 *
 * Vorgehen:
 *  1. Buchungen werden nach (accountId, normalisierter Merchant-Key)
 *     gruppiert. Der Merchant-Key wird aus den ersten beiden Memo-Zeilen
 *     gebildet — das trennt z. B. Amazon Prime, Kindle, Audible, Music
 *     zuverlaessig voneinander.
 *  2. Gruppen mit < 3 Buchungen, Zeitspanne < 60 Tagen oder gemischten
 *     Vorzeichen werden verworfen.
 *  3. Fuer verbleibende Gruppen wird der Median der Tages-Abstaende
 *     ermittelt und einer Periodizitaet (MONTHLY / QUARTERLY / YEARLY
 *     / CUSTOM) zugeordnet. Ist der Variationskoeffizient (std/median)
 *     groesser als 0.33, wird die Gruppe als "unregelmaessig" verworfen.
 *  4. Konfidenz-Formel nach ADR 0003: Basis = min(n*10, 60) +20 bei
 *     konstanten Perioden (std < 10 % des Medians) +20 bei konstanten
 *     Betraegen. Schwelle fuer Ausgabe: 50.
 */
import { normalizeMerchant } from "./merchant";
import type { Periodicity } from "./recurring";

export interface DetectionInput {
  bookingDate: Date;
  amount: number;
  description: string;
  memoRaw: string;
  accountId: string;
}

export interface DetectionCandidate {
  accountId: string;
  label: string;
  merchantKey: string;
  periodicity: Periodicity;
  intervalDays: number | null;
  dayOfMonth: number | null;
  anchorDate: Date;
  expectedAmount: number;
  amountTolerance: number;
  confidence: number;
  sourceCount: number;
  sourceFrom: Date;
  sourceTo: Date;
  sourceNote: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONFIDENCE_THRESHOLD = 50;
const CV_REJECTION = 0.33;

/**
 * Deutsche Monatsnamen und -abkuerzungen, die im Text auftauchen koennen.
 * Werden nach Durchlaufen von normalizeMerchant erkannt, also hier in der
 * normalisierten Form (kleine Buchstaben, Umlaut -> ae/oe/ue).
 */
const GERMAN_MONTH_TOKENS = [
  "januar", "februar", "maerz", "april", "mai", "juni", "juli",
  "august", "september", "sept", "oktober", "november", "dezember",
  "jan", "feb", "maer", "apr", "jun", "jul", "aug", "sep", "okt", "nov", "dez",
];

/**
 * Extrahiert den Merchant-Key aus den ersten beiden Memo-Zeilen.
 *
 * Ueber die Basis-Normalisierung hinaus werden fuer die Erkennung noch
 * pure Ziffern-Tokens (Datum "01.01.26" → "01 01 26" → alles weg) und
 * deutsche Monatsnamen ("Februar", "Abschlag Mai") entfernt — beides
 * variiert von Monat zu Monat und darf nicht zum Gruppierungs-Schluessel
 * beitragen.
 */
export function deriveMerchantKey(memoRaw: string): string {
  const lines = memoRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const combined = lines.slice(0, 2).join(" ");

  let key = normalizeMerchant(combined);

  // Pure Ziffern-Tokens raus (Beträge, Kurznummern, Datums-Reste).
  key = key.replace(/\b\d+\b/g, " ");

  // Deutsche Monatsnamen raus — saisonale Textbestandteile wuerden den
  // Schluessel sonst jeden Monat aendern.
  const monthRegex = new RegExp(`\\b(${GERMAN_MONTH_TOKENS.join("|")})\\b`, "g");
  key = key.replace(monthRegex, " ");

  return key.replace(/\s+/g, " ").trim();
}

/**
 * Liest den PayPal-Haendlernamen aus der zweiten Memo-Zeile.
 * Format: "<refnummer>/PP.XXXX.PP/. <Haendler>, Ihr Einkauf bei ...".
 * Bei Nicht-Treffer: null.
 */
const PAYPAL_LINE2_MERCHANT = /PP\.\d+\.PP[^\w]+([^,\n]+?)(?:,\s*Ihr Einkauf|$)/i;

function extractPaypalMerchant(line: string): string | null {
  const m = PAYPAL_LINE2_MERCHANT.exec(line);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Generische Volksbank-Buchungstypen, die in der `description` stehen
 * und keine geeignete Label-Quelle sind. Bei diesen Werten greifen wir
 * auf die erste Memo-Zeile zurueck.
 */
const GENERIC_DESCRIPTIONS = new Set([
  "basislastschrift",
  "kartenzahlung girocard",
  "kartenzahlung debit mc",
  "überweisungsauftrag",
  "ueberweisungsauftrag",
  "überweisungsgutschr.",
  "ueberweisungsgutschr.",
  "überweisungsgutschr",
  "ueberweisungsgutschr",
  "auszahlung girocard",
  "retouren",
  "entgelt/auslagen",
  "entgelt auslagen",
  "abschluss lt. anlage 1",
]);

function shortLabel(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Extrahiert ein lesbares Label. Logik:
 *  1. PayPal-Spezialfall: erkenne "PayPal..." in Zeile 1 und ziehe den
 *     echten Haendler aus Zeile 2 ("PayPal: ardour.org").
 *  2. Wenn `description` keine generische Volksbank-Buchungsart ist
 *     (also etwas wie "bunq BV", "OPENAI *CHATGPT SUBSCR"), nutze
 *     `description` direkt — das ist bei bunq der saubere Haendler.
 *  3. Sonst falle auf die erste Memo-Zeile zurueck (Volksbank-Fall).
 */
function deriveLabel(input: { description: string; memoRaw: string }): string {
  const lines = input.memoRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line1 = lines[0] ?? "";
  const line2 = lines[1] ?? "";
  const description = input.description.trim();

  if (/paypal/i.test(line1) && line2) {
    const merchant = extractPaypalMerchant(line2);
    if (merchant) {
      return shortLabel(`PayPal: ${merchant}`);
    }
  }

  if (description && !GENERIC_DESCRIPTIONS.has(description.toLowerCase())) {
    return shortLabel(description);
  }

  if (line1) return shortLabel(line1);
  return "Wiederkehrende Zahlung";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mode(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestCount = 0;
  let bestValue = values[0];
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < bestValue)) {
      bestCount = c;
      bestValue = v;
    }
  }
  return bestValue;
}

function classifyPeriodicity(medianDays: number): {
  periodicity: Periodicity;
  intervalDays: number | null;
} {
  if (medianDays >= 26 && medianDays <= 33) {
    return { periodicity: "MONTHLY", intervalDays: null };
  }
  if (medianDays >= 85 && medianDays <= 95) {
    return { periodicity: "QUARTERLY", intervalDays: null };
  }
  if (medianDays >= 358 && medianDays <= 372) {
    return { periodicity: "YEARLY", intervalDays: null };
  }
  return {
    periodicity: "CUSTOM",
    intervalDays: Math.max(1, Math.round(medianDays)),
  };
}

const monthNames = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

function formatSourceNote(count: number, from: Date, to: Date): string {
  const fmt = (d: Date) => `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  return `${count} Buchungen · ${fmt(from)} – ${fmt(to)}`;
}

/**
 * Kernfunktion. Nimmt eine Liste von Buchungen, gibt die erkannten
 * wiederkehrenden Kandidaten zurueck — sortiert nach Konfidenz absteigend.
 */
export function detectRecurringCandidates(
  inputs: DetectionInput[],
): DetectionCandidate[] {
  // Gruppierung nach (accountId, merchantKey)
  type Group = {
    accountId: string;
    merchantKey: string;
    transactions: DetectionInput[];
  };
  const groups = new Map<string, Group>();
  for (const input of inputs) {
    const key = deriveMerchantKey(input.memoRaw);
    if (!key) continue; // leere Memos ignorieren
    const groupKey = `${input.accountId}|${key}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.transactions.push(input);
    } else {
      groups.set(groupKey, {
        accountId: input.accountId,
        merchantKey: key,
        transactions: [input],
      });
    }
  }

  const candidates: DetectionCandidate[] = [];

  for (const group of groups.values()) {
    const allTxns = [...group.transactions].sort(
      (a, b) => a.bookingDate.getTime() - b.bookingDate.getTime(),
    );
    if (allTxns.length < 3) continue;

    // Vorzeichen-Analyse: Retouren (z. B. geplatzte Lastschrift mit
    // Rueckgabe im selben Monat) toleranter behandeln. Gemeinsames Muster
    // soll nicht ganz verworfen werden, nur weil in einem Monat eine
    // Rueckbuchung dabei ist. Schwelle: wenn mindestens 80 % der Buchungen
    // dasselbe Vorzeichen haben, beschraenken wir die Analyse auf diese
    // Mehrheit.
    const positiveCount = allTxns.filter((t) => t.amount > 0).length;
    const negativeCount = allTxns.filter((t) => t.amount < 0).length;
    const signedTotal = positiveCount + negativeCount;
    if (signedTotal === 0) continue;
    const majorityRatio = Math.max(positiveCount, negativeCount) / signedTotal;
    if (majorityRatio < 0.8) continue;
    const majoritySign = positiveCount >= negativeCount ? 1 : -1;
    const txns = allTxns.filter((t) =>
      majoritySign > 0 ? t.amount > 0 : t.amount < 0,
    );
    const n = txns.length;
    if (n < 3) continue;

    const from = startOfDay(txns[0].bookingDate);
    const to = startOfDay(txns[n - 1].bookingDate);
    const spanDays = diffDays(from, to);
    if (spanDays < 60) continue;

    // Tages-Abstaende zwischen aufeinanderfolgenden Buchungen
    const gaps: number[] = [];
    for (let i = 1; i < n; i++) {
      gaps.push(diffDays(txns[i - 1].bookingDate, txns[i].bookingDate));
    }
    const gapMedian = median(gaps);
    if (gapMedian < 1) continue;

    const gapStd = stddev(gaps);
    const gapCV = gapStd / gapMedian;
    if (gapCV > CV_REJECTION) continue;

    const { periodicity, intervalDays } = classifyPeriodicity(gapMedian);

    // Betrag: Median + Streuung
    const amounts = txns.map((t) => t.amount);
    const amountMedian = median(amounts);
    const amountStd = stddev(amounts);
    const amountCV = amountMedian !== 0 ? amountStd / Math.abs(amountMedian) : 0;

    // Konfidenz-Scoring
    let confidence = Math.min(n * 10, 60);
    if (gapCV < 0.10) confidence += 20;
    if (amountCV < 0.10) confidence += 20;
    confidence = Math.max(0, Math.min(100, confidence));

    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const daysOfMonth = txns.map((t) => t.bookingDate.getDate());
    const dayOfMonth =
      periodicity === "CUSTOM" ? null : mode(daysOfMonth);

    // Toleranz: std aufgerundet auf 1 Cent, aber mindestens 0.
    const toleranceRaw = amountStd;
    const amountTolerance = Math.max(0, Math.ceil(toleranceRaw * 100) / 100);

    candidates.push({
      accountId: group.accountId,
      label: deriveLabel(txns[n - 1]),
      merchantKey: group.merchantKey,
      periodicity,
      intervalDays,
      dayOfMonth,
      anchorDate: from,
      expectedAmount: Math.round(amountMedian * 100) / 100,
      amountTolerance,
      confidence,
      sourceCount: n,
      sourceFrom: from,
      sourceTo: to,
      sourceNote: formatSourceNote(n, from, to),
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}
