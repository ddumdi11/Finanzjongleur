import { AccountType } from "@prisma/client";

/**
 * Deutsche Anzeige-Labels fuer die Prisma-Enum-Werte aus `AccountType`.
 *
 * Die DB speichert weiterhin die Enum-Werte (z. B. "CHECKING"). Diese Map
 * uebersetzt sie fuer UI-Zwecke. Neue Enum-Werte im Prisma-Schema werden
 * dank `Record<AccountType, string>` vom TypeScript-Compiler erzwungen —
 * sobald das Enum waechst, meckert `tsc`, wenn hier ein Label fehlt.
 */
export const accountTypeLabels: Record<AccountType, string> = {
  CHECKING: "Girokonto",
  CREDIT_CARD: "Kreditkarte",
  SAVINGS: "Tagesgeld / Sparkonto",
  CASH: "Bargeld",
};
