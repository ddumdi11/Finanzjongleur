import type { RecurrenceKind } from "@prisma/client";

export const recurrenceKindLabels: Record<RecurrenceKind, string> = {
  MONTHLY: "monatlich",
  QUARTERLY: "quartalsweise",
  YEARLY: "jährlich",
  CUSTOM: "individuell",
};

/**
 * Menschlich lesbare Beschreibung der Periodizitaet.
 * Fuer CUSTOM wird das Intervall in Tagen mit ausgegeben.
 */
export function describePeriodicity(
  kind: RecurrenceKind,
  intervalDays: number | null,
): string {
  if (kind === "CUSTOM" && intervalDays && intervalDays > 0) {
    return intervalDays === 1 ? "täglich" : `alle ${intervalDays} Tage`;
  }
  return recurrenceKindLabels[kind];
}
