export type ParsedTransaction = {
  bookingDateISO: string;
  valueDateISO: string;
  description: string;
  amount: number;
  memoRaw: string;
};

export const VOLKSBANK_START_LINE = /^\d{2}\.\d{2}(?:\.\d{4})?\.?\s+\d{2}\.\d{2}(?:\.\d{4})?\.?/;

function normalizeGermanAmount(amountRaw: string): number {
  const sanitized = amountRaw.replace(/\s+/g, "");
  const withoutThousands = sanitized.replace(/\./g, "");
  const normalizedDecimal = withoutThousands.replace(",", ".");

  return Number(normalizedDecimal);
}

function toISODate(day: number, month: number, year: number): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateToken(token: string): { day: number; month: number; year?: number } | null {
  const cleaned = token.trim().replace(/\.$/, "");
  const parts = cleaned.split(".");
  if (parts.length < 2 || parts.length > 3) return null;

  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = yearStr ? Number(yearStr) : undefined;

  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (yearStr && !Number.isInteger(year)) return null;

  return { day, month, year };
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

      if (!date || !amountRaw || !counterparty) return null;

      const normalizedAmount = normalizeGermanAmount(amountRaw);
      if (Number.isNaN(normalizedAmount)) return null;

      return {
        bookingDateISO: date,
        valueDateISO: date,
        description: counterparty,
        amount: normalizedAmount,
        memoRaw: purpose,
      };
    })
    .filter((item): item is ParsedTransaction => item !== null);
}

export function detectYearFromText(text: string): number {
  const yearMatch = text.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return Number(yearMatch[1]);
  }

  return new Date().getFullYear();
}

function chooseMostLikelyYear(years: number[]): number {
  if (years.length === 0) {
    return new Date().getFullYear();
  }

  const counts = new Map<number, number>();
  for (const year of years) {
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }

  let winnerYear = years[0];
  let winnerCount = counts.get(winnerYear) ?? 0;

  for (const [year, count] of counts.entries()) {
    if (count > winnerCount || (count === winnerCount && year > winnerYear)) {
      winnerYear = year;
      winnerCount = count;
    }
  }

  return winnerYear;
}

export function detectVolksbankStatementYear(text: string): number {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const headerLines: string[] = [];

  for (const line of lines) {
    if (VOLKSBANK_START_LINE.test(line)) {
      break;
    }
    if (line) {
      headerLines.push(line);
    }
  }

  const headerText = headerLines.join("\n");
  const years: number[] = [];

  // a) dd.mm.yyyy
  for (const match of headerText.matchAll(/\b\d{1,2}\.\d{1,2}\.((?:19|20)\d{2})\b/g)) {
    years.push(Number(match[1]));
  }

  // b) mm/yyyy
  for (const match of headerText.matchAll(/(?:^|[^\d])(0?[1-9]|1[0-2])\/((?:19|20)\d{2})(?!\d)/g)) {
    years.push(Number(match[2]));
  }

  // c) dd.mm.yy or dd.mm.yy.
  for (const match of headerText.matchAll(/\b\d{1,2}\.\d{1,2}\.(\d{2})(?:\b|(?=\.))/g)) {
    years.push(2000 + Number(match[1]));
  }

  return chooseMostLikelyYear(years);
}

export function parseVolksbankPaste(text: string, year?: number): ParsedTransaction[] {
  const statementYear = year ?? detectVolksbankStatementYear(text);
  const dateTokenPattern = "(\\d{2}\\.\\d{2}(?:\\.\\d{4})?\\.?)";
  const startPattern = new RegExp(`^${dateTokenPattern}\\s+${dateTokenPattern}\\s+(.*?)\\s+([0-9][0-9.,]*)\\s+([SH])\\s*$`);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const transactions: ParsedTransaction[] = [];
  let current:
    | {
        bookingDateISO: string;
        valueDateISO: string;
        description: string;
        amount: number;
        memoLines: string[];
      }
    | null = null;

  for (const line of lines) {
    if (/^Übertrag\b/i.test(line)) {
      continue;
    }

    const match = line.match(startPattern);

    if (match) {
      if (current) {
        transactions.push({
          bookingDateISO: current.bookingDateISO,
          valueDateISO: current.valueDateISO,
          description: current.description,
          amount: current.amount,
          memoRaw: current.memoLines.join("\n"),
        });
      }

      const [, bookingToken, valueToken, descriptionRaw, amountRaw, direction] = match;
      const bookingDateParts = parseDateToken(bookingToken);
      const valueDateParts = parseDateToken(valueToken);

      if (!bookingDateParts || !valueDateParts) {
        current = null;
        continue;
      }

      const hasFullYearBoth = bookingDateParts.year !== undefined && valueDateParts.year !== undefined;
      const lineYear = hasFullYearBoth ? bookingDateParts.year : statementYear;
      const bookingDateISO = toISODate(bookingDateParts.day, bookingDateParts.month, lineYear);
      const valueDateISO = toISODate(valueDateParts.day, valueDateParts.month, lineYear);

      if (!bookingDateISO || !valueDateISO) {
        current = null;
        continue;
      }

      const absoluteAmount = normalizeGermanAmount(amountRaw);
      if (Number.isNaN(absoluteAmount)) {
        current = null;
        continue;
      }

      const amount = direction === "S" ? -Math.abs(absoluteAmount) : Math.abs(absoluteAmount);

      current = {
        bookingDateISO,
        valueDateISO,
        description: descriptionRaw.trim(),
        amount,
        memoLines: [],
      };
      continue;
    }

    if (current) {
      current.memoLines.push(line);
    }
  }

  if (current) {
    transactions.push({
      bookingDateISO: current.bookingDateISO,
      valueDateISO: current.valueDateISO,
      description: current.description,
      amount: current.amount,
      memoRaw: current.memoLines.join("\n"),
    });
  }

  return transactions;
}
