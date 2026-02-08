export type ParsedTransaction = {
  date: string;
  amount: number;
  counterparty: string;
  purpose: string;
};

export function parseSimpleTransactions(input: string): ParsedTransaction[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, amountRaw, counterparty, purpose] = line.split(";").map((part) => part.trim());
      if (!date || !amountRaw || !counterparty || !purpose) return null;

      const normalizedAmount = Number(amountRaw.replace(",", "."));
      if (Number.isNaN(normalizedAmount)) return null;

      return { date, amount: normalizedAmount, counterparty, purpose };
    })
    .filter((item): item is ParsedTransaction => item !== null);
}
