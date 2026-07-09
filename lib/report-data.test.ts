import { describe, it, expect } from "vitest";
import type { TransactionCategory } from "@prisma/client";
import { summarizeMonthlyGroups } from "./report-data";

/**
 * Baut eine Prisma-`groupBy`-artige Gruppe. `amount` wird bewusst als String
 * uebergeben, um die Prisma-Decimal-Serialisierung nachzustellen (die
 * Decimal→Number-Wandlung geschieht in report-data).
 */
function group(category: TransactionCategory | null, amount: string, count: number) {
  return {
    category,
    _sum: { amount },
    _count: { _all: count },
  };
}

describe("summarizeMonthlyGroups", () => {
  it("rechnet Eigenübertragungen (TRANSFER) aus Einnahmen, Ausgaben und Zeilen heraus", () => {
    const income = [
      group("INCOME", "2000", 1),
      group("TRANSFER", "500", 1),
    ];
    const expense = [
      group("GROCERIES", "-300", 4),
      group("TRANSFER", "-500", 1),
    ];

    const summary = summarizeMonthlyGroups(income, expense);

    // Hauptsummen ohne Transfer
    expect(summary.incomeTotal).toBe(2000);
    expect(summary.expenseTotal).toBe(-300);

    // Kategorie-Zeilen enthalten keinen TRANSFER-Eintrag
    expect(summary.incomeRows.map((r) => r.category)).not.toContain("TRANSFER");
    expect(summary.expenseRows.map((r) => r.category)).not.toContain("TRANSFER");
    expect(summary.incomeRows).toHaveLength(1);
    expect(summary.expenseRows).toHaveLength(1);
  });

  it("weist Eigenübertragungen separat als internalTransfers-Block aus", () => {
    const income = [group("TRANSFER", "500", 2)];
    const expense = [group("TRANSFER", "-800", 3)];

    const { internalTransfers } = summarizeMonthlyGroups(income, expense);

    expect(internalTransfers.incomeSum).toBe(500);
    expect(internalTransfers.expenseSum).toBe(-800);
    expect(internalTransfers.netSum).toBe(-300);
    expect(internalTransfers.count).toBe(5);
  });

  it("zaehlt nur Nicht-Transfer-Buchungen in monthTxnCount", () => {
    const income = [group("INCOME", "1000", 2), group("TRANSFER", "500", 1)];
    const expense = [group("GROCERIES", "-200", 3), group("TRANSFER", "-500", 1)];

    const summary = summarizeMonthlyGroups(income, expense);

    // 2 + 3 = 5 Nicht-Transfer-Buchungen; die beiden Transfers zaehlen nicht mit.
    expect(summary.monthTxnCount).toBe(5);
    expect(summary.internalTransfers.count).toBe(2);
  });

  it("liefert einen leeren Transfer-Block, wenn es keine Eigenübertragungen gibt", () => {
    const income = [group("INCOME", "1000", 1)];
    const expense = [group("GROCERIES", "-200", 2)];

    const { internalTransfers } = summarizeMonthlyGroups(income, expense);

    expect(internalTransfers).toEqual({
      incomeSum: 0,
      expenseSum: 0,
      netSum: 0,
      count: 0,
    });
  });

  it("sortiert Kategorie-Zeilen nach Betragshoehe absteigend", () => {
    const expense = [
      group("GROCERIES", "-100", 1),
      group("RENT", "-900", 1),
      group("DINING", "-300", 1),
    ];

    const { expenseRows } = summarizeMonthlyGroups([], expense);

    expect(expenseRows.map((r) => r.category)).toEqual(["RENT", "DINING", "GROCERIES"]);
  });
});
