import Link from "next/link";
import { transactionCategoryLabels } from "@/lib/category-labels";
import { buildMonthlyReport } from "@/lib/report-data";

/**
 * Berichte-Seite (Phase A): eine minimale, aber nutzbare Monats-Auswertung.
 *
 * Bewusst ohne Charts und ohne neue Dependencies. Die gesamte Datenaufbereitung
 * (Prisma `groupBy` / `_sum` / `_count`, Decimal→Number-Wandlung) liegt in
 * `lib/report-data.ts`; diese Seite kümmert sich nur um die Darstellung.
 *
 * Query-Parameter:
 *  - `month`  = "YYYY-MM" (Default: aktueller Monat)
 *  - `account`= Konto-Id  (Default: alle Konten)
 */

type ReportsPageProps = {
  searchParams: Promise<{ month?: string; account?: string }>;
};

function makeCurrencyFormatter(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency });
}

function amountClass(value: number): string {
  return value < 0 ? "negative" : "positive";
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const report = await buildMonthlyReport({ month: params.month, account: params.account });

  const {
    monthTitle,
    prevMonthTitle,
    currency,
    accountName,
    accounts,
    mixedCurrencyWarning,
    incomeRows,
    expenseRows,
    incomeTotal,
    expenseTotal,
    saldo,
    uncategorized,
    internalTransfers,
    monthTxnCount,
    comparison,
  } = report;

  const uncatCount = uncategorized.count;
  const uncatSum = uncategorized.sum;
  const hasTransfers = internalTransfers.count > 0;

  const fmt = makeCurrencyFormatter(currency);

  function linkFor(monthValue: string): string {
    const q = new URLSearchParams();
    q.set("month", monthValue);
    if (report.accountId) q.set("account", report.accountId);
    return `/berichte?${q.toString()}`;
  }

  function formatDelta(value: number): string {
    const formatted = fmt.format(Math.abs(value));
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `−${formatted}`;
    return formatted;
  }

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
          <input type="month" name="month" defaultValue={report.monthKey} style={{ marginTop: "0.25rem" }} />
        </label>
        <label>
          Konto
          <br />
          <select name="account" defaultValue={report.accountId} style={{ marginTop: "0.25rem" }}>
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
        <Link href={linkFor(report.prevMonthKey)}>← Vormonat</Link>
        {" · "}
        <strong>{monthTitle}</strong>
        {accountName ? ` · ${accountName}` : " · Alle Konten"}
        {" · "}
        <Link href={linkFor(report.nextMonthKey)}>Folgemonat →</Link>
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

      {monthTxnCount === 0 && uncatCount === 0 && !hasTransfers ? (
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
                <br />
                <small>
                  Alle Hauptzahlen sind <strong>ohne Eigenübertragungen</strong> (interne
                  Umbuchungen zwischen eigenen Konten) gerechnet
                  {hasTransfers ? " — siehe eigener Abschnitt unten." : "."}
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
            <h3>Eigenübertragungen / interne Umbuchungen</h3>
            {!hasTransfers ? (
              <p>
                <small>Keine Eigenübertragungen in diesem Monat.</small>
              </p>
            ) : (
              <>
                <p>
                  <small>
                    Nicht in Einnahmen, Ausgaben und Saldo enthalten — nur Verschiebungen
                    zwischen eigenen Konten.
                  </small>
                </p>
                <ul className="transaction-list">
                  <li className="transaction-row">
                    <span>Eingehend</span>
                    <span />
                    <span className={`transaction-amount ${amountClass(internalTransfers.incomeSum)}`}>
                      {fmt.format(internalTransfers.incomeSum)}
                    </span>
                  </li>
                  <li className="transaction-row">
                    <span>Ausgehend</span>
                    <span />
                    <span className={`transaction-amount ${amountClass(internalTransfers.expenseSum)}`}>
                      {fmt.format(internalTransfers.expenseSum)}
                    </span>
                  </li>
                  <li className="transaction-row">
                    <span>
                      <strong>Netto</strong>
                    </span>
                    <span>
                      <small>
                        {internalTransfers.count.toLocaleString("de-DE")} Buchung
                        {internalTransfers.count === 1 ? "" : "en"}
                      </small>
                    </span>
                    <span className={`transaction-amount ${amountClass(internalTransfers.netSum)}`}>
                      {fmt.format(internalTransfers.netSum)}
                    </span>
                  </li>
                </ul>
              </>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h3>Vergleich mit Vormonat</h3>
            <p>
              <small>Alle Werte ohne Eigenübertragungen.</small>
            </p>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }} />
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{monthTitle}</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>
                    {prevMonthTitle}
                  </th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => {
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
