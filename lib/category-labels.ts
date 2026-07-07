/**
 * Deutsche Anzeige-Labels fuer die Prisma-Enum-Werte aus
 * `TransactionCategory` (siehe prisma/schema.prisma).
 *
 * Diese Datei ist die einzige Quelle fuer deutsche Kategorie-Namen im UI.
 * Die Reihenfolge in `TRANSACTION_CATEGORY_VALUES` ist auch die bevorzugte
 * Anzeige-Reihenfolge in Dropdowns — thematisch gruppiert von "oft" zu
 * "selten", endet mit Sonstiges.
 */

export const TRANSACTION_CATEGORY_VALUES = [
  "GROCERIES",
  "DISCRETIONARY",
  "DINING",
  "SUBSCRIPTIONS",
  "COMMUNICATIONS",
  "TRANSPORT",
  "RENT",
  "UTILITIES",
  "INSURANCE",
  "HEALTH",
  "FEES",
  "GIFT",
  "INCOME",
  "CASH",
  "TRANSFER",
  "OTHER",
] as const;

export type TransactionCategoryValue = (typeof TRANSACTION_CATEGORY_VALUES)[number];

export const transactionCategoryLabels: Record<TransactionCategoryValue, string> = {
  GROCERIES: "Lebensmittel",
  DISCRETIONARY: "Konsum",
  DINING: "Gastronomie",
  SUBSCRIPTIONS: "Abos",
  COMMUNICATIONS: "Internet/Mobilfunk",
  TRANSPORT: "Mobilität/ÖPNV",
  RENT: "Miete",
  UTILITIES: "Energie & Versorgung",
  INSURANCE: "Versicherung",
  HEALTH: "Gesundheit",
  FEES: "Bankgebühren",
  GIFT: "Geschenke",
  INCOME: "Einkommen",
  CASH: "Bargeld",
  TRANSFER: "Eigenübertragung",
  OTHER: "Sonstiges",
};
