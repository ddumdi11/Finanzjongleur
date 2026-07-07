import Link from "next/link";
import type { TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transactionCategoryLabels } from "@/lib/category-labels";

/**
 * Berichte-Seite (Phase A): eine minimale, aber nutzbare Monats-Auswertung.
 *
 * Bewusst ohne Charts und ohne neue Dependencies. Die gesamte Summierung
 * passiert per Prisma `groupBy` / `_sum` / `_count` in der Datenbank — in
 * JavaScript werden nur die wenigen bereits aggregierten Kategoriewerte zu
 * Monatssummen zusammengefasst, nie einzelne Buchungen durchsummiert.
 *
 * Query-Parameter:
 *  - `month`  = "YYYY-MM" (Default: aktueller Monat)
 *  - `account`= Konto-Id  (Default: alle Konten)
 */

type ReportsPageProps = {
  searchParams: Promise<{ month?: string; account?: string }>;
};

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

function makeCurrencyFormatter(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency });
}

/** Prisma-Decimal (oder null) sicher in eine Zahl fuer die Anzeige wandeln. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function amountClass(value: number): string {
  return value < 0 ? "negative" : "positive";
}

type CategoryRow = {
  category: TransactionCategory;
  sum: number;
  count: number;
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

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const accountFilter = (params.account ?? "").trim();

  // Monatsgrenzen: [Anfang, Ende) — Ende ist exklusiv der 1. des Folgemonats.
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = monthStart;

  const currentKey = monthKey(year, month);
  const prevKey = monthKey(prevStart.getFullYear(), prevStart.getMonth() + 1);
  const nextDate = new Date(year, month, 1);
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
  const fmt = makeCurrencyFormatter(currency);
  const distinctCurrencies = new Set(accounts.map((a) => a.currency));
  const mixedCurrencyWarning = !accountFilter && distinctCurrencies.size > 1;

  const monthTitle = monthLabelFormatter.format(monthStart);

  function linkFor(monthValue: string): string {
    const q = new URLSearchParams();
    q.set("month", monthValue);
    if (accountFilter) q.set("account", accountFilter);
    return `/berichte?${q.toString()}`;
  }

  function formatDelta(value: number): string {
    const formatted = fmt.format(Math.abs(value));
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `−${formatted}`;
    return formatted;
  }

  const comparisonRows: { label: string; current: number; previous: number }[] = [
    { label: "Einnahmen", current: incomeTotal, previous: prevIncome },
    { label: "Ausgaben", current: expenseTotal, previous: prevExpense },
    { label: "Saldo", current: saldo, previous: prevSaldo },
  ];

  return (
    <section className="card">
      <h2>Berichte · Monatsauswertung</h2>

      <form
        method="get"
        action="/berichte"
        style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", margin: "1em 0" }}
      >
        <label>
          Monat
          <br />
          <input type="month" name="month" defaultValue={currentKey} style={{ marginTop: "0.25rem" }} />
        </label>
        <label>
          Konto
          <br />
          <select name="account" defaultValue={accountFilter} style={{ marginTop: "0.25rem" }}>
            <option value="">Alle Konten</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Anzeigen</button>
      </form>

      <p>
        <Link href={linkFor(prevKey)}>← Vormonat</Link>
        {" · "}
        <strong>{monthTitle}</strong>
        {selectedAccount ? ` · ${selectedAccount.name}` : " · Alle Konten"}
        {" · "}
        <Link href={linkFor(nextKey)}>Folgemonat →</Link>
      </p>

      {mixedCurrencyWarning ? (
        <p>
          <small>
            Hinweis: Deine Konten nutzen unterschiedliche Währungen. Über „Alle
            Konten“ werden Beträge in {currency} zusammengefasst — für eine
            währungsreine Auswertung ein einzelnes Konto wählen.
          </small>
        </p>
      ) : null}

      {monthTxnCount === 0 && uncatCount === 0 ? (
        <p>Keine Buchungen in diesem Monat.</p>
      ) : (
        <>
          <div className="grid" style={{ marginTop: "1rem" }}>
            <div>
              <h3>Saldo {monthTitle}</h3>
              <p className={`transaction-amount ${amountClass(saldo)}`} style={{ fontSize: "1.5rem", textAlign: "left" }}>
                {fmt.format(saldo)}
              </p>
              <p>
                <small>
                  Einnahmen {fmt.format(incomeTotal)} · Ausgaben {fmt.format(expenseTotal)} ·{" "}
                  {monthTxnCount.toLocaleString("de-DE")} Buchung
                  {monthTxnCount === 1 ? "" : "en"}
                </small>
              </p>
            </div>
          </div>

          <section style={{ marginTop: "1.5rem" }}>
            <h3>Einnahmen nach Kategorie</h3>
            {incomeRows.length === 0 ? (
              <p>
                <small>Keine Einnahmen mit Kategorie in diesem Monat.</small>
              </p>
            ) : (
              <ul className="transaction-list">
                {incomeRows.map((row) => (
                  <li key={`in-${row.category}`} className="transaction-row">
                    <span>{transactionCategoryLabels[row.category]}</span>
                    <span>
                      <small>
                        {row.count.toLocaleString("de-DE")} Buchung{row.count === 1 ? "" : "en"}
                      </small>
                    </span>
                    <span className={`transaction-amount ${amountClass(row.sum)}`}>{fmt.format(row.sum)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h3>Ausgaben nach Kategorie</h3>
            {expenseRows.length === 0 ? (
              <p>
                <small>Keine Ausgaben mit Kategorie in diesem Monat.</small>
              </p>
            ) : (
              <ul className="transaction-list">
                {expenseRows.map((row) => (
                  <li key={`out-${row.category}`} className="transaction-row">
                    <span>{transactionCategoryLabels[row.category]}</span>
                    <span>
                      <small>
                        {row.count.toLocaleString("de-DE")} Buchung{row.count === 1 ? "" : "en"}
                      </small>
                    </span>
                    <span className={`transaction-amount ${amountClass(row.sum)}`}>{fmt.format(row.sum)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h3>Unkategorisiert</h3>
            {uncatCount === 0 ? (
              <p>
                <small>Alle Buchungen dieses Monats sind kategorisiert. 🎯</small>
              </p>
            ) : (
              <p>
                <strong>{uncatCount.toLocaleString("de-DE")}</strong> Buchung
                {uncatCount === 1 ? "" : "en"} ohne Kategorie · Summe{" "}
                <span className={`transaction-amount ${amountClass(uncatSum)}`}>{fmt.format(uncatSum)}</span>
                <br />
                <small>
                  <Link href="/transactions?only=uncategorized">
                    In den Buchungen nachkategorisieren →
                  </Link>{" "}
                  — dort lassen sich die noch offenen Buchungen einer Kategorie
                  zuordnen, damit sie hier in der Auswertung erscheinen.
                </small>
              </p>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h3>Vergleich mit Vormonat</h3>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }} />
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{monthTitle}</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>
                    {monthLabelFormatter.format(prevStart)}
                  </th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => {
                  const delta = row.current - row.previous;
                  return (
                    <tr key={row.label}>
                      <td style={{ padding: "0.25rem 0.5rem" }}>{row.label}</td>
                      <td
                        className={`transaction-amount ${amountClass(row.current)}`}
                        style={{ padding: "0.25rem 0.5rem" }}
                      >
                        {fmt.format(row.current)}
                      </td>
                      <td
                        className={`transaction-amount ${amountClass(row.previous)}`}
                        style={{ padding: "0.25rem 0.5rem" }}
                      >
                        {fmt.format(row.previous)}
                      </td>
                      <td
                        className={`transaction-amount ${amountClass(delta)}`}
                        style={{ padding: "0.25rem 0.5rem" }}
                      >
                        {formatDelta(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </section>
  );
}
