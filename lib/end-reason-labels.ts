/**
 * Deutsche Anzeige-Labels fuer den Prisma-Enum `RecurringEndReason`
 * (siehe prisma/schema.prisma). Wird im "Beenden"-Formular auf der
 * Forecast-Seite als optionales Dropdown angeboten.
 *
 * Die Reihenfolge in `RECURRING_END_REASON_VALUES` ist auch die
 * bevorzugte Anzeige-Reihenfolge — von "haeufig" zu "selten / sonst".
 */

export const RECURRING_END_REASON_VALUES = [
  "TOO_EXPENSIVE",
  "NOT_NEEDED",
  "PROVIDER_SWITCH",
  "OTHER",
] as const;

export type RecurringEndReasonValue = (typeof RECURRING_END_REASON_VALUES)[number];

export const recurringEndReasonLabels: Record<RecurringEndReasonValue, string> = {
  TOO_EXPENSIVE: "Zu teuer",
  NOT_NEEDED: "Nicht mehr benötigt",
  PROVIDER_SWITCH: "Anbieterwechsel",
  OTHER: "Sonstiges",
};
