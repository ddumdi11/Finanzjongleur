import { describe, expect, it } from "vitest";
import {
  TRANSACTION_CATEGORY_VALUES,
  transactionCategoryLabels,
} from "./category-labels";

describe("transactionCategoryLabels", () => {
  it("hat ein nicht-leeres deutsches Label fuer jede Kategorie", () => {
    for (const value of TRANSACTION_CATEGORY_VALUES) {
      const label = transactionCategoryLabels[value];
      expect(label, `Label fehlt fuer ${value}`).toBeTruthy();
      expect(label.trim().length, `Label fuer ${value} ist leer`).toBeGreaterThan(0);
    }
  });

  it("hat keine doppelten Labels", () => {
    const labels = Object.values(transactionCategoryLabels);
    const unique = new Set(labels);
    expect(unique.size, "Doppelte Labels gefunden").toBe(labels.length);
  });

  it("hat keine doppelten Enum-Werte in der Reihenfolgeliste", () => {
    const unique = new Set(TRANSACTION_CATEGORY_VALUES);
    expect(unique.size).toBe(TRANSACTION_CATEGORY_VALUES.length);
  });
});
