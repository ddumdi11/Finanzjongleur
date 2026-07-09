import type { TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Datenaufbau für die Berichte-Seite und (später) den Export.
 *
 * `buildMonthlyReport` kapselt die komplette Prisma-Aggregation
 * (`groupBy` / `_sum` / `_count`) und liefert ein flaches, serialisierbares
 * Objekt zurück. Die eigentliche Summierung passiert weiterhin in der
 * Datenbank — in JavaScript werden nur die wenigen bereits aggregierten
 * Kategoriewerte zu Monatssummen zusammengefasst, nie einzelne Buchungen
 * durchsummiert. Die Decimal→Number-Wandlung geschieht ausschließlich hier
 * an einer Stelle (`toNumber`), damit die Seite mit reinen Zahlen arbeitet.
 */

const monthLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Baut den "YYYY-MM"-Schluessel aus Jahr und 1-basiertem Monat. */
function monthKey(year: number, month1: number): string {
  return `${year}-${pad2(month1)}`;
}

/**
 * Liest den Monat aus dem Query-Parameter. Erwartet "YYYY-MM"; bei fehlender
 * oder unplausibler Eingabe faellt die Funktion auf den aktuellen Monat
 * zurueck. `month` ist 1-basiert (1 = Januar).
 */
function parseMonth(value: string | undefined): { year: number; month: number } {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 };
  if (!value) return fallback;
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 1970 || year > 3000 || month < 1 || month > 12) return fallback;
  return { year, month };
}

/** Prisma-Decimal (oder null) sicher in eine Zahl fuer die Anzeige wandeln. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export type CategoryRow = {
  category: TransactionCategory;
  sum: number;
  count: number;
};

export type ComparisonRow = {
  label: string;
  current: number;
  previous: number;
};

/** Ein Konto-Eintrag für das Auswahlfeld auf der Seite. */
export type ReportAccount = {
  id: string;
  name: string;
};

/**
 * Flaches, serialisierbares Ergebnis einer Monatsauswertung. Enthält alle
 * Werte, die Seite und Export für die Darstellung brauchen — bereits als
 * einfache Zahlen/Strings, ohne Prisma-Decimals.
 */
export type MonthlyReport = {
  /** "YYYY-MM" des ausgewerteten Monats (normalisiert). */
  monthKey: string;
  /** "YYYY-MM" des Vor- bzw. Folgemonats für die Navigation. */
  prevMonthKey: string;
  nextMonthKey: string;
  /** Normalisierter Kontofilter ("" = alle Konten). */
  accountId: string;
  /** Anzeige-Titel, z. B. "Juli 2026". */
  monthTitle: string;
  prevMonthTitle: string;
  /** Währung der Auswertung; bei Kontofilter die des Kontos, sonst EUR. */
  currency: string;
  /** Name des gewählten Kontos oder null bei „Alle Konten“. */
  accountName: string | null;
  /** Alle Konten (für das Auswahlfeld auf der Seite). */
  accounts: ReportAccount[];
  /** Warnung, wenn ohne Kontofilter über mehrere Währungen summiert wird. */
  mixedCurrencyWarning: boolean;
  incomeRows: CategoryRow[];
  expenseRows: CategoryRow[];
  incomeTotal: number;
  expenseTotal: number;
  saldo: number;
  uncategorized: { count: number; sum: number };
  monthTxnCount: number;
  comparison: ComparisonRow[];
};

/**
 * Wandelt gruppierte Buchungen in Anzeige-Zeilen. Die `null`-Kategorie
 * (unkategorisiert) wird ausgelassen — sie bekommt einen eigenen Abschnitt.
 * Sortiert nach Betragshoehe absteigend.
 */
function buildCategoryRows(
  groups: {
    category: TransactionCategory | null;
    _sum: { amount: unknown };
    _count: { _all: number };
  }[],
): CategoryRow[] {
  return groups
    .filter((g): g is typeof g & { category: TransactionCategory } => g.category !== null)
    .map((g) => ({
      category: g.category,
      sum: toNumber(g._sum.amount),
      count: g._count._all,
    }))
    .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
}

/**
 * Baut die komplette Monatsauswertung für einen Monat ("YYYY-MM") und einen
 * optionalen Kontofilter (Konto-Id; leer/undefined = alle Konten). Alle
 * Aggregationen laufen in der Datenbank; hier werden nur die aggregierten
 * Ergebnisse zusammengefasst und in einfache Zahlen gewandelt.
 */
export async function buildMonthlyReport({
  month,
  account,
}: {
  month?: string;
  account?: string;
}): Promise<MonthlyReport> {
  const { year, month: month1 } = parseMonth(month);
  const accountFilter = (account ?? "").trim();

  // Monatsgrenzen: [Anfang, Ende) — Ende ist exklusiv der 1. des Folgemonats.
  const monthStart = new Date(year, month1 - 1, 1);
  const monthEnd = new Date(year, month1, 1);
  const prevStart = new Date(year, month1 - 2, 1);
  const prevEnd = monthStart;

  const currentKey = monthKey(year, month1);
  const prevKey = monthKey(prevStart.getFullYear(), prevStart.getMonth() + 1);
  const nextDate = new Date(year, month1, 1);
  const nextKey = monthKey(nextDate.getFullYear(), nextDate.getMonth() + 1);

  const acctWhere = accountFilter ? { accountId: accountFilter } : {};

  const [
    accounts,
    incomeGroups,
    expenseGroups,
    uncategorized,
    prevIncomeAgg,
    prevExpenseAgg,
  ] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    // Einnahmen (amount > 0) je Kategorie, Summe + Anzahl aus der DB.
    prisma.transaction.groupBy({
      by: ["category"],
      where: { ...acctWhere, bookingDate: { gte: monthStart, lt: monthEnd }, amount: { gt: 0 } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Ausgaben (amount < 0) je Kategorie.
    prisma.transaction.groupBy({
      by: ["category"],
      where: { ...acctWhere, bookingDate: { gte: monthStart, lt: monthEnd }, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Unkategorisiert: eine saubere Summe + Anzahl unabhaengig vom Vorzeichen.
    prisma.transaction.aggregate({
      where: { ...acctWhere, bookingDate: { gte: monthStart, lt: monthEnd }, category: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Vormonat: nur die Gesamtsummen fuer den Vergleich.
    prisma.transaction.aggregate({
      where: { ...acctWhere, bookingDate: { gte: prevStart, lt: prevEnd }, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...acctWhere, bookingDate: { gte: prevStart, lt: prevEnd }, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  const incomeRows = buildCategoryRows(incomeGroups);
  const expenseRows = buildCategoryRows(expenseGroups);

  // Monatssummen aus den (wenigen) aggregierten Gruppen — inklusive der
  // unkategorisierten Anteile, damit der Saldo den vollen Monat abbildet.
  const incomeTotal = incomeGroups.reduce((s, g) => s + toNumber(g._sum.amount), 0);
  const expenseTotal = expenseGroups.reduce((s, g) => s + toNumber(g._sum.amount), 0);
  const saldo = incomeTotal + expenseTotal;

  const prevIncome = toNumber(prevIncomeAgg._sum.amount);
  const prevExpense = toNumber(prevExpenseAgg._sum.amount);
  const prevSaldo = prevIncome + prevExpense;

  const uncatSum = toNumber(uncategorized._sum.amount);
  const uncatCount = uncategorized._count._all;

  const monthTxnCount =
    incomeGroups.reduce((s, g) => s + g._count._all, 0) +
    expenseGroups.reduce((s, g) => s + g._count._all, 0);

  // Waehrung: bei Kontofilter die des Kontos, sonst EUR als Default.
  const selectedAccount = accountFilter ? accounts.find((a) => a.id === accountFilter) : undefined;
  const currency = selectedAccount?.currency ?? "EUR";
  const distinctCurrencies = new Set(accounts.map((a) => a.currency));
  const mixedCurrencyWarning = !accountFilter && distinctCurrencies.size > 1;

  const comparison: ComparisonRow[] = [
    { label: "Einnahmen", current: incomeTotal, previous: prevIncome },
    { label: "Ausgaben", current: expenseTotal, previous: prevExpense },
    { label: "Saldo", current: saldo, previous: prevSaldo },
  ];

  return {
    monthKey: currentKey,
    prevMonthKey: prevKey,
    nextMonthKey: nextKey,
    accountId: accountFilter,
    monthTitle: monthLabelFormatter.format(monthStart),
    prevMonthTitle: monthLabelFormatter.format(prevStart),
    currency,
    accountName: selectedAccount?.name ?? null,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    mixedCurrencyWarning,
    incomeRows,
    expenseRows,
    incomeTotal,
    expenseTotal,
    saldo,
    uncategorized: { count: uncatCount, sum: uncatSum },
    monthTxnCount,
    comparison,
  };
}
