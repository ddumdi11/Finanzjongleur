import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { describePeriodicity } from "@/lib/periodicity-labels";
import {
  confirmProposalAction,
  deleteRecurringPaymentAction,
  discardProposalAction,
  restoreProposalAction,
} from "../actions";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function ProposalsPage() {
  const [proposals, dismissed] = await Promise.all([
    prisma.recurringPayment.findMany({
      where: {
        source: "AUTO_DETECTED",
        confirmedAt: null,
        dismissedAt: null,
      },
      include: { account: true },
      orderBy: [
        { confidence: "desc" },
        { label: "asc" },
      ],
    }),
    prisma.recurringPayment.findMany({
      where: {
        source: "AUTO_DETECTED",
        confirmedAt: null,
        dismissedAt: { not: null },
      },
      include: { account: true },
      orderBy: { dismissedAt: "desc" },
    }),
  ]);

  return (
    <section className="card">
      <h2>Vorschläge aus der Historie ({proposals.length})</h2>
      <p>
        <Link href="/forecast">← zurück zum Forecast</Link>
      </p>

      {proposals.length === 0 ? (
        <p>
          Keine offenen Vorschläge. Auf der Forecast-Seite kannst du die
          Erkennung erneut starten, wenn neue Buchungen importiert wurden.
        </p>
      ) : (
        <>
          <p>
            <small>
              Vorschläge werden aus deiner Buchungshistorie abgeleitet. Bestätige
              die, die zu deinen tatsächlichen wiederkehrenden Zahlungen gehören,
              und verwirf die Rauschgruppen. Jährliche Zahlungen erkennt das
              System aus einem Jahr Daten nicht — die bleiben Handarbeit.
            </small>
          </p>
          <ul className="transaction-list">
            {proposals.map((p) => {
              const amount = Number(p.expectedAmount);
              const tolerance = Number(p.amountTolerance ?? 0);
              const formatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: p.currency,
              });
              return (
                <li key={p.id} className="transaction-row">
                  <span>
                    {p.nextExpectedDate
                      ? dateFormatter.format(p.nextExpectedDate)
                      : "—"}
                  </span>
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <small>
                      {p.account.name}
                      {" · "}
                      {describePeriodicity(p.periodicity, p.intervalDays)}
                      {" · "}
                      Konfidenz {p.confidence ?? 0}%
                      {p.sourceNote ? ` · ${p.sourceNote}` : null}
                      {tolerance > 0 ? ` · Toleranz ±${formatter.format(tolerance)}` : null}
                    </small>
                  </span>
                  <span className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}>
                    {formatter.format(amount)}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <form action={confirmProposalAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Bestätigen</button>
                    </form>
                    <form action={discardProposalAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Verwerfen</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dismissed.length > 0 ? (
        <details style={{ marginTop: "2rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "1.1rem", fontWeight: 600 }}>
            Verworfene Vorschläge ({dismissed.length})
          </summary>
          <p>
            <small>
              Diese Gruppen hast du verworfen. Sie werden beim Erkennungslauf
              nicht erneut angeboten. „Wieder anbieten" holt sie zurück in die
              offene Liste; „Endgültig löschen" entfernt den Eintrag aus der DB
              (kann dann beim nächsten Erkennungslauf wieder auftauchen).
            </small>
          </p>
          <ul className="transaction-list">
            {dismissed.map((p) => {
              const amount = Number(p.expectedAmount);
              const formatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: p.currency,
              });
              return (
                <li key={p.id} className="transaction-row" style={{ flexWrap: "wrap" }}>
                  <span>
                    {p.dismissedAt ? dateFormatter.format(p.dismissedAt) : "—"}
                  </span>
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <small>
                      {p.account.name}
                      {" · "}
                      {describePeriodicity(p.periodicity, p.intervalDays)}
                      {" · "}
                      Konfidenz {p.confidence ?? 0}%
                      {p.sourceNote ? ` · ${p.sourceNote}` : null}
                    </small>
                  </span>
                  <span className={`transaction-amount ${amount < 0 ? "negative" : "positive"}`}>
                    {formatter.format(amount)}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    <form action={restoreProposalAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit">Wieder anbieten</button>
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
