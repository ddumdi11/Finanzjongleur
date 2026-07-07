import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  TRANSACTION_CATEGORY_VALUES,
  transactionCategoryLabels,
} from "@/lib/category-labels";
import { recurrenceKindLabels } from "@/lib/periodicity-labels";
import { createRecurringPaymentAction } from "../actions";

export default async function NewRecurringPaymentPage() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, type: true, currency: true },
  });

  return (
    <section className="card">
      <h2>Neue wiederkehrende Zahlung</h2>
      <p>
        <Link href="/forecast">← zurück zum Forecast</Link>
      </p>

      {accounts.length === 0 ? (
        <p>
          Bitte zuerst ein <Link href="/konten/neu">Konto anlegen</Link>, bevor du
          wiederkehrende Zahlungen erfassen kannst.
        </p>
      ) : (
        <form action={createRecurringPaymentAction}>
          <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem 0" }}>
            <legend>
              <strong>Was</strong>
            </legend>
            <p>
              <label htmlFor="accountId">Konto</label>
              <br />
              <select id="accountId" name="accountId" required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </p>
            <p>
              <label htmlFor="label">Bezeichnung</label>
              <br />
              <input
                id="label"
                name="label"
                type="text"
                required
                placeholder="z. B. Miete, Strom E.ON, Netflix"
                maxLength={120}
                style={{ width: "100%", maxWidth: "28rem" }}
              />
            </p>
            <p>
              <label htmlFor="category">Kategorie (optional)</label>
              <br />
              <select id="category" name="category">
                <option value="">– keine Kategorie –</option>
                {TRANSACTION_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {transactionCategoryLabels[c]}
                  </option>
                ))}
              </select>
            </p>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem 0" }}>
            <legend>
              <strong>Betrag</strong>
            </legend>
            <p>
              <label htmlFor="expectedAmount">Erwarteter Betrag (€)</label>
              <br />
              <input
                id="expectedAmount"
                name="expectedAmount"
                type="text"
                inputMode="decimal"
                required
                placeholder="-567,00"
                style={{ width: "10rem" }}
              />
              <br />
              <small>
                Negativer Wert = Ausgabe (typisch), positiver Wert = Einnahme. Format
                mit Komma oder Punkt.
              </small>
            </p>
            <p>
              <label htmlFor="amountTolerance">Toleranz (€, optional)</label>
              <br />
              <input
                id="amountTolerance"
                name="amountTolerance"
                type="text"
                inputMode="decimal"
                placeholder="0"
                style={{ width: "6rem" }}
              />
              <br />
              <small>
                Erlaubter Schwankungsbereich, z. B. 10 für Strom-Abschläge oder
                Versicherungs-Anpassungen.
              </small>
            </p>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem 0" }}>
            <legend>
              <strong>Rhythmus</strong>
            </legend>
            <p>
              <label htmlFor="periodicity">Periodizität</label>
              <br />
              <select id="periodicity" name="periodicity" required defaultValue="MONTHLY">
                <option value="MONTHLY">{recurrenceKindLabels.MONTHLY}</option>
                <option value="QUARTERLY">{recurrenceKindLabels.QUARTERLY}</option>
                <option value="YEARLY">{recurrenceKindLabels.YEARLY}</option>
                <option value="CUSTOM">{recurrenceKindLabels.CUSTOM} (eigenes Intervall)</option>
              </select>
            </p>
            <p style={{ padding: "0.75rem 1rem", background: "#fff8e1", borderLeft: "3px solid #e0a000" }}>
              <small>
                <strong>Hinweis zu jährlichen Zahlungen:</strong> Die Auto-Erkennung
                aus der Historie findet jährliche Zahlungen aus nur einem Jahr Daten
                nicht — sie braucht mindestens zwei Wiederholungen. GEZ, Kfz-Steuer,
                Jahresprämien usw. daher bitte immer hier manuell erfassen, bis zwei
                volle Jahre Historie vorliegen.
              </small>
            </p>
            <p>
              <label htmlFor="intervalDays">Intervall in Tagen (nur bei „individuell")</label>
              <br />
              <input
                id="intervalDays"
                name="intervalDays"
                type="number"
                min={1}
                max={3650}
                step={1}
                placeholder="z. B. 14"
                style={{ width: "8rem" }}
              />
            </p>
            <p>
              <label htmlFor="dayOfMonth">Ausführungstag (1–31, optional)</label>
              <br />
              <input
                id="dayOfMonth"
                name="dayOfMonth"
                type="number"
                min={1}
                max={31}
                step={1}
                placeholder="z. B. 1"
                style={{ width: "6rem" }}
              />
              <br />
              <small>
                Leer lassen, um den Tag aus dem Startdatum zu übernehmen. In
                Monaten mit weniger Tagen wird auf den letzten Monatstag geclippt
                (31 → 28/29/30).
              </small>
            </p>
            <p>
              <label htmlFor="anchorDate">Startdatum / Ankerdatum</label>
              <br />
              <input
                id="anchorDate"
                name="anchorDate"
                type="date"
                required
                style={{ width: "11rem" }}
              />
              <br />
              <small>
                Das Datum der ersten Auftrittsinstanz (vergangen oder zukünftig). Die
                App berechnet daraus die nächsten Termine im Forecast.
              </small>
            </p>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem 0" }}>
            <legend>
              <strong>Verknüpfung (optional)</strong>
            </legend>
            <p>
              <label htmlFor="merchantKey">Merchant-Key</label>
              <br />
              <input
                id="merchantKey"
                name="merchantKey"
                type="text"
                placeholder="z. B. a.h.f. immobilien verwaltungs gmbh"
                style={{ width: "100%", maxWidth: "28rem" }}
              />
              <br />
              <small>
                Für den späteren Abgleich mit eingehenden Buchungen. Kann leer
                bleiben und wird in einer späteren Ausbaustufe automatisch gesetzt.
              </small>
            </p>
          </fieldset>

          <button type="submit">Anlegen</button>
        </form>
      )}
    </section>
  );
}
