export type ParsedTransaction = {
  date: string;
  amount: number;
  counterparty: string;
  purpose: string;
};

function normalizeGermanAmount(amountRaw: string): number {
  const sanitized = amountRaw.replace(/\s+/g, "");
  const withoutThousands = sanitized.replace(/\./g, "");
  const normalizedDecimal = withoutThousands.replace(",", ".");

  return Number(normalizedDecimal);
}

export function parseSimpleTransactions(input: string): ParsedTransaction[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(";").map((part) => part.trim());
      const [date, amountRaw, counterparty] = parts.slice(0, 3);
      const purpose = parts.slice(3).join(";");

      if (!date || !amountRaw || !counterparty || !purpose) return null;

      const normalizedAmount = normalizeGermanAmount(amountRaw);
      if (Number.isNaN(normalizedAmount)) return null;

      return { date, amount: normalizedAmount, counterparty, purpose };
    })
    .filter((item): item is ParsedTransaction => item !== null);
}
