/**
 * Reine Forecast-Berechnung fuer wiederkehrende Zahlungen.
 *
 * Diese Datei haengt bewusst NICHT von Prisma ab. Die Typen werden
 * kompatibel zum `RecurringPayment`-Modell gehalten (siehe
 * prisma/schema.prisma), sind aber strukturell, damit die Logik rein
 * testbar bleibt.
 */

export type Periodicity = "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

/**
 * Minimale Felder, die fuer die Forecast-Berechnung noetig sind.
 * Alle weiteren Felder des Prisma-Modells (Betrag, Account, Merchant,
 * Konfidenz etc.) spielen fuer `computeNextExpectedDate` keine Rolle.
 */
export interface RecurringPaymentShape {
  periodicity: Periodicity;
  /** Fuer CUSTOM erforderlich; sonst ignoriert. */
  intervalDays?: number | null;
  /** Ueberschreibt den Tag, der aus `anchorDate` folgen wuerde. */
  dayOfMonth?: number | null;
  /** Erste bekannte/geplante Auftrittsdatum. */
  anchorDate: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Liefert das naechste erwartete Auftrittsdatum, das gleich oder nach
 * der Referenz liegt. Default der Referenz ist "heute 00:00 Ortszeit".
 *
 * Verhalten:
 *  - Liegt `anchorDate` bereits in der Zukunft, wird `anchorDate` selbst
 *    zurueckgegeben (die erste Auftrittsinstanz ist dann die naechste).
 *  - Fuer MONTHLY/QUARTERLY/YEARLY wird der Schritt in Monaten gerechnet
 *    (1 / 3 / 12). Der gewuenschte Tag kommt aus `dayOfMonth`
 *    (Fallback: Tag des `anchorDate`). In Monaten, die diesen Tag nicht
 *    haben (z. B. 31. Februar), wird auf den letzten Monats-Tag geclippt.
 *  - Fuer CUSTOM ist `intervalDays` erforderlich und muss > 0 sein.
 */
export function computeNextExpectedDate(
  payment: RecurringPaymentShape,
  reference: Date = new Date(),
): Date {
  const ref = startOfDay(reference);
  const anchor = startOfDay(payment.anchorDate);

  if (anchor.getTime() >= ref.getTime()) {
    return anchor;
  }

  if (payment.periodicity === "CUSTOM") {
    const interval = payment.intervalDays ?? 0;
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error(
        "intervalDays muss fuer periodicity=CUSTOM eine positive Zahl sein.",
      );
    }
    const diffMs = ref.getTime() - anchor.getTime();
    const diffDays = Math.ceil(diffMs / MS_PER_DAY);
    const stepsNeeded = Math.ceil(diffDays / interval);
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + stepsNeeded * interval);
    return startOfDay(next);
  }

  const stepMonths: Record<Exclude<Periodicity, "CUSTOM">, number> = {
    MONTHLY: 1,
    QUARTERLY: 3,
    YEARLY: 12,
  };
  const step = stepMonths[payment.periodicity];
  const intendedDay = payment.dayOfMonth ?? anchor.getDate();

  let candidate = anchor;
  // Schleife faellt spaetestens nach n=~36000 Iterationen (100 Jahre
  // monatlich) durch; in realen Szenarien typisch weniger als 200.
  while (candidate.getTime() < ref.getTime()) {
    candidate = addMonthsClamped(candidate, step, intendedDay);
  }
  return candidate;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Addiert Monate und clippt den Tag auf das Monatsende, falls der
 * gewuenschte Tag im Zielmonat nicht existiert (z. B. 31. Februar
 * wird zum 28./29.).
 */
function addMonthsClamped(d: Date, months: number, intendedDay: number): Date {
  const monthTotal = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(monthTotal / 12);
  const targetMonth = ((monthTotal % 12) + 12) % 12;
  // Tag 0 des Folgemonats = letzter Tag des Zielmonats.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(intendedDay, 1), lastDayOfTargetMonth);

  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setFullYear(targetYear, targetMonth, clampedDay);
  return x;
}

/**
 * Liefert alle Auftritts-Instanzen einer wiederkehrenden Zahlung, die im
 * geschlossenen Intervall [from, to] liegen — sortiert aufsteigend.
 *
 * Nutzt intern `computeNextExpectedDate`, um Schritt fuer Schritt
 * vorwaerts zu laufen. Das Verhalten ist stabil auch bei Monats-
 * clipping (z. B. "Ende jeden Monats") und liefert keine Duplikate.
 *
 * Ist `from > to` oder die berechnete Instanz liegt nach `to`, ist die
 * Rueckgabe leer.
 */
export function occurrencesInRange(
  payment: RecurringPaymentShape,
  from: Date,
  to: Date,
): Date[] {
  if (from.getTime() > to.getTime()) return [];

  const result: Date[] = [];
  const toTime = startOfDay(to).getTime();
  let next = computeNextExpectedDate(payment, from);

  // Schutz gegen Endlosschleifen bei falschen Eingaben — maximal 10.000
  // Iterationen sind mehrere Jahrhunderte tägliche Wiederkehr.
  let safety = 0;
  while (next.getTime() <= toTime) {
    result.push(next);
    const advance = new Date(next);
    advance.setDate(advance.getDate() + 1);
    const candidate = computeNextExpectedDate(payment, advance);
    if (candidate.getTime() <= next.getTime()) break;
    next = candidate;
    if (++safety > 10000) break;
  }
  return result;
}
