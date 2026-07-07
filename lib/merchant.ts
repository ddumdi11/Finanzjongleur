const NOISE_TOKENS = new Set([
  "eref",
  "mref",
  "cred",
  "mandatsref",
  "mandat",
  "tel",
  "telefon",
  "uhr",
  "iban",
  "bic",
  "zweck",
  "verwendungszweck",
]);

function normalizeUmlauts(value: string): string {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function normalizeMerchant(input: string): string {
  const lower = normalizeUmlauts(input.toLowerCase().trim());

  const withoutIban = lower.replace(/\b[a-z]{2}\d{2}[a-z0-9]{10,30}\b/g, " ");
  const withoutBic = withoutIban.replace(/\b[a-z]{4}[a-z]{2}[a-z0-9]{2}(?:[a-z0-9]{3})?\b/g, " ");
  const withoutLongNumbers = withoutBic.replace(/\b\d{4,}\b/g, " ");
  const normalizedSeparators = withoutLongNumbers.replace(/[_|/\\,:;()[\]{}<>*#+~"'`.-]+/g, " ");

  const cleanedTokens = normalizedSeparators
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !NOISE_TOKENS.has(token));

  return cleanedTokens.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Leitet den `merchantKey` einer Transaktion aus dem Memo-Feld ab.
 *
 * Verwendet die erste nicht-leere Memo-Zeile — bei Volksbank-Buchungen ist
 * das der Haendlername ("REWE Markt GmbH", "ERGO Krankenversiche", "PayPal
 * Europe S.a.r.l. et Cie S.C.A" etc.). Kettengeschaefte mit wechselnden
 * Filialen werden dadurch unter einem Key zusammengefasst (wollen wir, denn
 * die Kategorie-Entscheidung des Nutzers soll chain-weit wirken).
 *
 * Gibt `null` zurueck, wenn das Memo leer ist.
 */
export function deriveTransactionMerchantKey(memoRaw: string): string | null {
  const firstLine = memoRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const key = normalizeMerchant(firstLine);
  return key ? key : null;
}
