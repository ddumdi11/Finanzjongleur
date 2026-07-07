import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { occurrencesInRange } from "@/lib/recurring";
import { describePeriodicity } from "@/lib/periodicity-labels";
import { transactionCategoryLabels } from "@/lib/category-labels";
import {
  RECURRING_END_REASON_VALUES,
  recurringEndReasonLabels,
} from "@/lib/end-reason-labels";
import {
  deleteRecurringPaymentAction,
  endRecurringPaymentAction,
  reactivateRecurringPaymentAction,
  runDetectionAction,
  toggleRecurringPaymentActiveAction,
} from "./actions";

type ForecastPageProps = {
  searchParams: Promise<{ range?: string; account?: string }>;
};

const ALLOWED_RANGES = [30, 60, 90] as const;
type RangeDays = (typeof ALLOWED_RANGES)[number];

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dayFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

function parseRange(value: string | undefined): RangeDays {
  const n = Number(value);
  if (ALLOWED_RANGES.includes(n as RangeDays)) return n as RangeDays;
  return 30;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ForecastPage({ searchParams }: ForecastPageProps) {
  const params = await searchParams;
  const rangeDays = parseRange(params.range);
  const accountFilter = (params.account ?? "").trim();

  const today = startOfDay(new Date());
  const horizon = addDays(today, rangeDays);

  const [accounts, payments, pausedPayments, endedPayments, pendingProposals] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.recurringPayment.findMany({
      where: {
        isActive: true,
        endedAt: null,
        confirmedAt: { not: null },
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
      include: { account: true },
      orderBy: { label: "asc" },
    }),
    prisma.recurringPayment.findMany({
      where: {
        isActive: false,
        endedAt: null,
        confirmedAt: { not: null },
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
      include: { account: true },
      orderBy: { label: "asc" },
    }),
    prisma.recurringPayment.findMany({
      where: {
        endedAt: { not: null },
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
      include: { account: true },
      orderBy: { endedAt: "desc" },
    }),
    prisma.recurringPayment.count({
      where: {
        source: "AUTO_DETECTED",
        confirmedAt: null,
        dismissedAt: null,
      },
    }),
  ]);

  type ForecastRow = {
    date: Date;
    payment: (typeof payments)[number];
  };
  const rows: ForecastRow[] = [];
  for (const p of payments) {
    const dates = occurrencesInRange(
      {
        periodicity: p.periodicity,
        intervalDays: p.intervalDays,
        dayOfMonth: p.dayOfMonth,
        anchorDate: p.anchorDate,
      },
      today,
      horizon,
    );
    for (const date of dates) rows.push({ date, payment: p });
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const byMonth = new Map<string, ForecastRow[]>();
  for (const row of rows) {
    const key = monthKey(row.date);
    const list = byMonth.get(key) ?? [];
    list.push(row);
    byMonth.set(key, list);
  }

  const totalsByCurrency = new Map<string, number>();
  for (const row of rows) {
    const cur = row.payment.currency;
    const sum = totalsByCurrency.get(cur) ?? 0;
    totalsByCurrency.set(cur, sum + Number(row.payment.expectedAmount));
  }

  return (
    <section className="card">
      <h2>Forecast · erwartete Zahlungen</h2>

      <div style={{ margin: "1em 0", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/forecast/neu">+ Neue wiederkehrende Zahlung anlegen</Link>
        <span>·</span>
        <form action={runDetectionAction} style={{ display: "inline" }}>
          <button type="submit">Aus Historie erkennen</button>
        </form>
        {pendingProposals > 0 ? (
          <>
            <span>·</span>
            <Link href="/forecast/vorschlaege">
              {pendingProposals} offene{pendingProposals === 1 ? "r" : ""} Vorschlag
              {pendingProposals === 1 ? "" : "e"} prüfen
            </Link>
          </>
        ) : null}
      </div>

      <p>
        Zeitraum:{" "}
        {ALLOWED_RANGES.map((r, idx) => {
          const q = new URLSearchParams();
          q.set("range", String(r));
          if (accountFilter) q.set("account", accountFilter);
          const url = `/forecast?${q.toString()}`;
          const isActive = r === rangeDays;
          return (
            <span key={r}>
              {isActive ? (
                <strong>{r} Tage</strong>
              ) : (
                <Link href={url}>{r} Tage</Link>
              )}
              {idx < ALLOWED_RANGES.length - 1 ? " · " : null}
            </span>
          );
        })}
      </p>

      {accounts.length > 1 ? (
        <p>
          Konto:{" "}
          <Link
            href={`/forecast?range=${rangeDays}`}
            style={{ fontWeight: accountFilter ? "normal" : "bold" }}
          >
            Alle
          </Link>
          {accounts.map((a) => {
            const q = new URLSearchParams();
            q.set("range", String(rangeDays));
            q.set("account", a.id);
            return (
              <span key={a.id}>
                {" · "}
                <Link
                  href={`/forecast?${q.toString()}`}
                  style={{ fontWeight: accountFilter === a.id ? "bold" : "normal" }}
                >
                  {a.name}
                </Link>
              </span>
            );
          })}
        </p>
      ) : null}

      <p>
        <small>
          {rows.length === 0
            ? `Keine erwarteten Zahlungen in den nächsten ${rangeDays} Tagen.`
            : `${rows.length} Termin${rows.length === 1 ? "" : "e"} in den nächsten ${rangeDays} Tagen · Summe ${Array.from(totalsByCurrency.entries())
                .map(
                  ([cur, sum]) =>
                    new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: cur,
                    }).format(sum),
                )
                .join(" · ")}`}
        </small>
      </p>

      {rows.length === 0 ? (
        <p>
          Noch keine passenden Eintraege. Wenn du bereits wiederkehrende Zahlungen
          angelegt hast, fallen sie eventuell ausserhalb des gewaehlten Zeitraums.
        </p>
      ) : (
        <>
          {Array.from(byMonth.entries()).map(([key, entries]) => {
            const [year, month] = key.split("-").map(Number);
            const sampleDate = new Date(year, month - 1, 1);
            const monthTotalByCurrency = new Map<string, number>();
            for (const row of entries) {
              const cur = row.payment.currency;
              const sum = monthTotalByCurrency.get(cur) ?? 0;
              monthTotalByCurrency.set(cur, sum + Number(row.payment.expectedAmount));
            }
            return (
              <section key={key} style={{ marginTop: "1.5rem" }}>
                <h3>
                  {monthFormatter.format(sampleDate)}{" "}
                  <small>
                    (
                    {Array.from(monthTotalByCurrency.entries())
                      .map(([cur, sum]) =>
                        new Intl.NumberFormat("de-DE", {
                          style: "currency",
                          currency: cur,
                        }).format(sum),
                      )
                      .join(" · ")}
                    )
                  </small>
                </h3>
                <ul className="transaction-list">
                  {entries.map((row, i) => {
                    const amount = Number(row.payment.expectedAmount);
                    const formatter = new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: row.payment.currency,
                    });
                    return (
                      <li
                        key={`${row.payment.id}-${row.date.toISOString()}-${i}`}
                        className="transaction-row"
                      >
                        <span>{dayFormatter.format(row.date)}</span>
                        <span>
                          <strong>{row.payment.label}</strong>
                          <br />
                          <small>
                            {row.payment.account.name}
                            {" · "}
                            {describePeriodicity(row.payment.periodicity, row.payment.intervalDays)}
                            {row.payment.category
                              ? ` · ${transactionCategoryLabels[row.payment.category]}`
                              : null}
                          </small>
                        </span>
                        <span
                          className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}
                        >
                          {formatter.format(amount)}
                        </span>
                        <span />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {payments.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <h3>Alle aktiven wiederkehrenden Zahlungen ({payments.length})</h3>
          <ul className="transaction-list">
            {payments.map((p) => {
              const formatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: p.currency,
              });
              const amount = Number(p.expectedAmount);
              return (
                <li key={p.id} className="transaction-row" style={{ flexWrap: "wrap" }}>
                  <span>
                    {p.nextExpectedDate ? dateFormatter.format(p.nextExpectedDate) : "—"}
                  </span>
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <small>
                      {p.account.name}
                      {" · "}
                      {describePeriodicity(p.periodicity, p.intervalDays)}
                      {p.category ? ` · ${transactionCategoryLabels[p.category]}` : null}
                    </small>
                  </span>
                  <span className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}>
                    {formatter.format(amount)}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    <form action={toggleRecurringPaymentActiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Deaktivieren</button>
                    </form>
                    <details style={{ display: "inline-block" }}>
                      <summary style={{ cursor: "pointer", padding: "0.25rem 0.5rem", border: "1px solid #ccc", borderRadius: "0.25rem", display: "inline-block" }}>
                        Als beendet markieren
                      </summary>
                      <form
                        action={endRecurringPaymentAction}
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.75rem",
                          border: "1px solid #ccc",
                          borderRadius: "0.25rem",
                          display: "grid",
                          gap: "0.5rem",
                          minWidth: "16rem",
                        }}
                      >
                        <input type="hidden" name="id" value={p.id} />

                        <label>
                          Enddatum (Pflicht)
                          <input
                            type="date"
                            name="endedAt"
                            required
                            style={{ display: "block", marginTop: "0.25rem" }}
                          />
                        </label>

                        <label>
                          Vertragsstart (optional)
                          <input
                            type="date"
                            name="startedAt"
                            style={{ display: "block", marginTop: "0.25rem" }}
                          />
                        </label>

                        <label>
                          Grund (optional)
                          <select
                            name="endReason"
                            defaultValue=""
                            style={{ display: "block", marginTop: "0.25rem", width: "100%" }}
                          >
                            <option value="">— kein Grund —</option>
                            {RECURRING_END_REASON_VALUES.map((r) => (
                              <option key={r} value={r}>
                                {recurringEndReasonLabels[r]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Notizen (optional)
                          <textarea
                            name="endNote"
                            rows={2}
                            placeholder="z. B. über Webseite gekündigt, Bestätigung per Mail erhalten"
                            style={{ display: "block", marginTop: "0.25rem", width: "100%" }}
                          />
                        </label>

                        <button type="submit">Speichern und als beendet markieren</button>
                      </form>
                    </details>
                    <form action={deleteRecurringPaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        title="Hard-Delete ohne Notizen — kann beim nächsten Erkennungslauf erneut als Vorschlag auftauchen."
                      >
                        Löschen
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {pausedPayments.length > 0 ? (
        <details style={{ marginTop: "2rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "1.1rem", fontWeight: 600 }}>
            Pausierte Abos ({pausedPayments.length})
          </summary>
          <p>
            <small>
              Diese Einträge sind über „Deaktivieren" stillgelegt. „Aktivieren"
              holt sie zurück in den Forecast; „Löschen" entfernt sie endgültig.
            </small>
          </p>
          <ul className="transaction-list">
            {pausedPayments.map((p) => {
              const formatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: p.currency,
              });
              const amount = Number(p.expectedAmount);
              return (
                <li key={p.id} className="transaction-row" style={{ flexWrap: "wrap" }}>
                  <span>
                    {p.nextExpectedDate ? dateFormatter.format(p.nextExpectedDate) : "—"}
                  </span>
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <small>
                      {p.account.name}
                      {" · "}
                      {describePeriodicity(p.periodicity, p.intervalDays)}
                      {p.category ? ` · ${transactionCategoryLabels[p.category]}` : null}
                    </small>
                  </span>
                  <span className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}>
                    {formatter.format(amount)}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    <form action={toggleRecurringPaymentActiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Aktivieren</button>
                    </form>
                    <form action={deleteRecurringPaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Löschen</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {endedPayments.length > 0 ? (
        <details style={{ marginTop: "2rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "1.1rem", fontWeight: 600 }}>
            Beendete Abos ({endedPayments.length})
          </summary>
          <p>
            <small>
              Diese Einträge erscheinen nicht mehr im Forecast und werden beim
              Erkennungslauf nicht erneut vorgeschlagen.
            </small>
          </p>
          <ul className="transaction-list">
            {endedPayments.map((p) => {
              const formatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: p.currency,
              });
              const amount = Number(p.expectedAmount);
              const reasonLabel = p.endReason
                ? recurringEndReasonLabels[p.endReason as keyof typeof recurringEndReasonLabels]
                : null;
              return (
                <li key={p.id} className="transaction-row" style={{ flexWrap: "wrap" }}>
                  <span>
                    {p.endedAt ? dateFormatter.format(p.endedAt) : "—"}
                  </span>
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <small>
                      {p.account.name}
                      {" · "}
                      {describePeriodicity(p.periodicity, p.intervalDays)}
                      {p.category ? ` · ${transactionCategoryLabels[p.category]}` : null}
                      {p.startedAt ? ` · Start ${dateFormatter.format(p.startedAt)}` : null}
                      {reasonLabel ? ` · ${reasonLabel}` : null}
                    </small>
                    {p.endNote ? (
                      <>
                        <br />
                        <small style={{ fontStyle: "italic" }}>{p.endNote}</small>
                      </>
                    ) : null}
                  </span>
                  <span className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}>
                    {formatter.format(amount)}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    <form action={reactivateRecurringPaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Reaktivieren</button>
                    </form>
                    <form action={deleteRecurringPaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Endgültig löschen</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
