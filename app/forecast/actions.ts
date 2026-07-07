"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, RecurrenceKind, RecurringEndReason, TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextExpectedDate } from "@/lib/recurring";
import { detectRecurringCandidates, type DetectionInput } from "@/lib/recurring-detection";
import { TRANSACTION_CATEGORY_VALUES } from "@/lib/category-labels";
import { RECURRING_END_REASON_VALUES } from "@/lib/end-reason-labels";

const RECURRENCE_KINDS = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const;

function parseDecimal(value: unknown): Prisma.Decimal | null {
  if (typeof value !== "string") return null;
  let raw = value.trim();
  if (!raw) return null;

  // Typografische Minuszeichen (Unicode-Minus, En-Dash, Em-Dash) auf ASCII-Minus.
  raw = raw.replace(/[\u2212\u2013\u2014]/g, "-");
  // Waehrungssymbole, Buchstaben, Leerzeichen-Tausendertrenner (inkl. NBSP) rauswerfen.
  raw = raw.replace(/[^0-9.,\-]/g, "");
  if (!raw) return null;

  // Zulassen: "-12,34", "1234.56", "1.234,56"
  const cleaned =
    raw.includes(".") && raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return new Prisma.Decimal(asNumber);
}

function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // HTML date input liefert "YYYY-MM-DD".
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseIntInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export async function createRecurringPaymentAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const expectedAmount = parseDecimal(formData.get("expectedAmount"));
  const amountTolerance = parseDecimal(formData.get("amountTolerance")) ?? new Prisma.Decimal(0);
  const periodicityRaw = String(formData.get("periodicity") ?? "").trim();
  const intervalDays = parseIntInRange(formData.get("intervalDays"), 1, 3650);
  const dayOfMonth = parseIntInRange(formData.get("dayOfMonth"), 1, 31);
  const anchorDate = parseDateInput(formData.get("anchorDate"));
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const merchantKey = String(formData.get("merchantKey") ?? "").trim() || null;

  // Defensive Validierung — die UI bringt required/min/max mit, das hier
  // ist Schutz gegen manipulierte oder unvollstaendige FormData.
  if (!accountId) throw new Error("Konto ist erforderlich.");
  if (!label) throw new Error("Bezeichnung ist erforderlich.");
  if (!expectedAmount) {
    const raw = formData.get("expectedAmount");
    throw new Error(
      `Betrag ist nicht gueltig. Empfangen: ${JSON.stringify(raw)}`,
    );
  }
  if (!RECURRENCE_KINDS.includes(periodicityRaw as RecurrenceKind)) {
    throw new Error("Periodizitaet ist nicht gueltig.");
  }
  const periodicity = periodicityRaw as RecurrenceKind;
  if (!anchorDate) throw new Error("Startdatum ist nicht gueltig.");
  if (periodicity === "CUSTOM" && (intervalDays === null || intervalDays <= 0)) {
    throw new Error("Bei individueller Periodizitaet ist ein positives Intervall in Tagen erforderlich.");
  }

  const category = categoryRaw
    ? (TRANSACTION_CATEGORY_VALUES.includes(categoryRaw as (typeof TRANSACTION_CATEGORY_VALUES)[number])
        ? (categoryRaw as TransactionCategory)
        : null)
    : null;

  const nextExpectedDate = computeNextExpectedDate(
    {
      periodicity,
      intervalDays,
      dayOfMonth,
      anchorDate,
    },
  );

  await prisma.recurringPayment.create({
    data: {
      accountId,
      label,
      expectedAmount,
      amountTolerance,
      periodicity,
      intervalDays: periodicity === "CUSTOM" ? intervalDays : null,
      dayOfMonth,
      anchorDate,
      merchantKey,
      category,
      isActive: true,
      nextExpectedDate,
      source: "MANUAL",
      // Manuelle Eintraege sind sofort bestaetigt — sie erscheinen direkt im Forecast.
      confirmedAt: new Date(),
    },
  });

  revalidatePath("/forecast");
  redirect("/forecast");
}

export async function toggleRecurringPaymentActiveAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const existing = await prisma.recurringPayment.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.recurringPayment.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });
  revalidatePath("/forecast");
}

export async function deleteRecurringPaymentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.recurringPayment.delete({ where: { id } });
  revalidatePath("/forecast");
}

/**
 * Markiert eine wiederkehrende Zahlung als beendet (z. B. Abo gekuendigt).
 * Im Gegensatz zum Hard-Delete bleibt der Eintrag inkl. Notizen erhalten —
 * und verhindert, dass die Auto-Erkennung ihn gleich wieder vorschlaegt
 * (greift weiterhin ueber den bestehenden `confirmedAt`-Skip-Check).
 *
 * Pflichtfeld: `endedAt`. Optional: `startedAt`, `endNote`, `endReason`.
 * Setzt zusaetzlich `isActive=false` und loescht `nextExpectedDate`,
 * damit der Eintrag aus aktiven Listen / Forecast verschwindet.
 */
export async function endRecurringPaymentAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Eintrag-ID fehlt.");

  const endedAt = parseDateInput(formData.get("endedAt"));
  if (!endedAt) throw new Error("Enddatum ist erforderlich.");

  const startedAt = parseDateInput(formData.get("startedAt"));
  const endNoteRaw = String(formData.get("endNote") ?? "").trim();
  const endNote = endNoteRaw ? endNoteRaw : null;
  const reasonRaw = String(formData.get("endReason") ?? "").trim();
  const endReason: RecurringEndReason | null =
    reasonRaw &&
    RECURRING_END_REASON_VALUES.includes(
      reasonRaw as (typeof RECURRING_END_REASON_VALUES)[number],
    )
      ? (reasonRaw as RecurringEndReason)
      : null;

  await prisma.recurringPayment.update({
    where: { id },
    data: {
      endedAt,
      startedAt: startedAt ?? undefined,
      endNote,
      endReason,
      isActive: false,
      nextExpectedDate: null,
    },
  });

  revalidatePath("/forecast");
}

/**
 * Setzt einen als beendet markierten Eintrag wieder in den aktiven Zustand
 * zurueck. End-Felder werden geleert; das naechste erwartete Datum neu
 * berechnet, damit der Eintrag direkt wieder im Forecast erscheint.
 */
export async function reactivateRecurringPaymentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const existing = await prisma.recurringPayment.findUnique({ where: { id } });
  if (!existing) return;

  const nextExpectedDate = computeNextExpectedDate({
    periodicity: existing.periodicity,
    intervalDays: existing.intervalDays,
    dayOfMonth: existing.dayOfMonth,
    anchorDate: existing.anchorDate,
  });

  await prisma.recurringPayment.update({
    where: { id },
    data: {
      endedAt: null,
      endNote: null,
      endReason: null,
      isActive: true,
      nextExpectedDate,
    },
  });

  revalidatePath("/forecast");
}

/**
 * Laeuft die Historien-Analyse ab, schreibt neue Vorschlaege in die DB
 * (als `source=AUTO_DETECTED, confirmedAt=null`), aktualisiert bestehende
 * unbestaetigte Vorschlaege mit demselben merchantKey und ueberspringt
 * bereits bestaetigte Einträge (egal ob manuell oder zuvor bestaetigt).
 */
// Nimmt FormData entgegen, nutzt sie aber nicht — so passt die Signatur
// auf `<form action={runDetectionAction}>`.
export async function runDetectionAction(_formData: FormData) {
  void _formData;
  const transactions = await prisma.transaction.findMany({
    select: {
      accountId: true,
      bookingDate: true,
      amount: true,
      description: true,
      memoRaw: true,
    },
  });

  const inputs: DetectionInput[] = transactions.map((t) => ({
    accountId: t.accountId,
    bookingDate: t.bookingDate,
    amount: Number(t.amount),
    description: t.description,
    memoRaw: t.memoRaw,
  }));

  const candidates = detectRecurringCandidates(inputs);

  for (const candidate of candidates) {
    // Gibt es bereits eine bestaetigte oder verworfene Wiederkehr mit
    // diesem merchantKey? Dann ueberspringen — Nutzerentscheidung hat
    // Vorrang. (confirmedAt = bestaetigt/beendet; dismissedAt = verworfen)
    const userDecided = await prisma.recurringPayment.findFirst({
      where: {
        accountId: candidate.accountId,
        merchantKey: candidate.merchantKey,
        OR: [
          { confirmedAt: { not: null } },
          { dismissedAt: { not: null } },
        ],
      },
      select: { id: true },
    });
    if (userDecided) continue;

    const payload = {
      accountId: candidate.accountId,
      label: candidate.label,
      expectedAmount: new Prisma.Decimal(candidate.expectedAmount),
      amountTolerance: new Prisma.Decimal(candidate.amountTolerance),
      periodicity: candidate.periodicity as RecurrenceKind,
      intervalDays: candidate.intervalDays,
      dayOfMonth: candidate.dayOfMonth,
      anchorDate: candidate.anchorDate,
      merchantKey: candidate.merchantKey,
      isActive: true,
      nextExpectedDate: computeNextExpectedDate({
        periodicity: candidate.periodicity,
        intervalDays: candidate.intervalDays,
        dayOfMonth: candidate.dayOfMonth,
        anchorDate: candidate.anchorDate,
      }),
      source: "AUTO_DETECTED" as const,
      confidence: candidate.confidence,
      sourceNote: candidate.sourceNote,
      // confirmedAt bleibt explizit null — das kennzeichnet den Vorschlag
    };

    const existingProposal = await prisma.recurringPayment.findFirst({
      where: {
        accountId: candidate.accountId,
        merchantKey: candidate.merchantKey,
        source: "AUTO_DETECTED",
        confirmedAt: null,
      },
      select: { id: true },
    });

    if (existingProposal) {
      await prisma.recurringPayment.update({
        where: { id: existingProposal.id },
        data: payload,
      });
    } else {
      await prisma.recurringPayment.create({ data: payload });
    }
  }

  revalidatePath("/forecast");
  revalidatePath("/forecast/vorschlaege");
  redirect("/forecast/vorschlaege");
}

export async function confirmProposalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.recurringPayment.update({
    where: { id },
    data: { confirmedAt: new Date() },
  });
  revalidatePath("/forecast");
  revalidatePath("/forecast/vorschlaege");
}

/**
 * Markiert einen Vorschlag als verworfen (soft delete via dismissedAt).
 * So bleibt der Eintrag in der DB und blockiert kuenftige
 * Detection-Laeufe fuer denselben merchantKey. Hard-Delete passiert
 * nur explizit ueber `deleteRecurringPaymentAction` (z. B. aus der
 * "Verworfene Vorschlaege"-Sektion).
 */
export async function discardProposalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.recurringPayment.update({
    where: { id },
    data: { dismissedAt: new Date() },
  });
  revalidatePath("/forecast");
  revalidatePath("/forecast/vorschlaege");
}

/**
 * Holt einen verworfenen Vorschlag zurueck in die offene Liste. Nuetzlich,
 * wenn man die Verwerfen-Aktion rueckgaengig machen will, ohne den
 * naechsten Erkennungslauf zu erzwingen.
 */
export async function restoreProposalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.recurringPayment.update({
    where: { id },
    data: { dismissedAt: null },
  });
  revalidatePath("/forecast");
  revalidatePath("/forecast/vorschlaege");
}
