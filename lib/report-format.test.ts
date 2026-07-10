import { describe, it, expect } from "vitest";
import type { MonthlyReport } from "./report-data";
import { renderReportHtml, renderReportMarkdown, renderReportCsv } from "./report-format";

/**
 * Handgebautes Fixture. `accountName` enthält bewusst HTML- und CSV-relevante
 * Sonderzeichen (`<`, `>`, `&`, `"`, `,`), damit sich das Escaping in allen
 * drei Renderern prüfen lässt.
 */
function makeReport(overrides: Partial<MonthlyReport> = {}): MonthlyReport {
  return {
    monthKey: "2026-07",
    prevMonthKey: "2026-06",
    nextMonthKey: "2026-08",
    accountId: "",
    monthTitle: "Juli 2026",
    prevMonthTitle: "Juni 2026",
    currency: "EUR",
    accountName: 'Giro <Haupt> & "Co", DE',
    accounts: [
      { id: "a1", name: 'Giro <Haupt> & "Co", DE' },
      { id: "a2", name: "Sparbuch" },
    ],
    mixedCurrencyWarning: false,
    incomeRows: [{ category: "INCOME", sum: 2000, count: 1 }],
    expenseRows: [{ category: "GROCERIES", sum: -300.5, count: 4 }],
    incomeTotal: 2000,
    expenseTotal: -300.5,
    saldo: 1699.5,
    uncategorized: { count: 2, sum: -50 },
    internalTransfers: { incomeSum: 500, expenseSum: -500, netSum: 0, count: 3 },
    monthTxnCount: 5,
    comparison: [
      { label: "Einnahmen", current: 2000, previous: 1800 },
      { label: "Ausgaben", current: -300.5, previous: -250 },
      { label: "Saldo", current: 1699.5, previous: 1550 },
    ],
    ...overrides,
  };
}

describe("renderReportHtml", () => {
  it("liefert ein eigenständiges HTML-Dokument mit Grundstruktur", () => {
    const html = renderReportHtml(makeReport());
    const lower = html.toLowerCase();
    expect(lower).toContain("<!doctype html>");
    expect(lower).toContain('<html lang="de">');
    expect(lower).toContain("<head>");
    expect(lower).toContain("<body>");
  });

  it("enthält den Monatstitel", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("Finanzbericht Juli 2026");
  });

  it("enthält mindestens eine Einnahmen- und eine Ausgabenkategorie", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("Einkommen"); // Label für INCOME
    expect(html).toContain("Lebensmittel"); // Label für GROCERIES
  });

  it("weist Eigenübertragungen separat aus", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("Eigenübertragungen");
    expect(html).toContain("Eingehend");
    expect(html).toContain("Ausgehend");
    expect(html).toContain("Netto");
  });

  it("escaped HTML-Sonderzeichen korrekt", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("Giro &lt;Haupt&gt; &amp; &quot;Co&quot;, DE");
    expect(html).not.toContain("<Haupt>");
  });

  it("rendert leere Einnahmen/Ausgaben ohne Tabelle", () => {
    const html = renderReportHtml(makeReport({ incomeRows: [], expenseRows: [] }));
    expect(html).toContain("Keine Einnahmen mit Kategorie in diesem Monat.");
    expect(html).toContain("Keine Ausgaben mit Kategorie in diesem Monat.");
  });
});

describe("renderReportMarkdown", () => {
  it("enthält eine Überschrift mit Monat", () => {
    const md = renderReportMarkdown(makeReport());
    expect(md).toContain("# Finanzbericht Juli 2026");
  });

  it("enthält Markdown-Tabellenstruktur", () => {
    const md = renderReportMarkdown(makeReport());
    expect(md).toContain("| Kategorie | Anzahl | Betrag |");
    expect(md).toContain("| --- | ---: | ---: |");
  });

  it("enthält alle geforderten Abschnitte", () => {
    const md = renderReportMarkdown(makeReport());
    expect(md).toContain("## Einnahmen");
    expect(md).toContain("## Ausgaben");
    expect(md).toContain("## Zusammenfassung");
    expect(md).toContain("## Eigenübertragungen");
    expect(md).toContain("## Monatsvergleich");
    // Zusammenfassung + Vergleich enthalten die Kernpositionen
    expect(md).toContain("| **Saldo** |");
    expect(md).toContain("Juni 2026"); // Vormonatsspalte im Vergleich
  });

  it("rendert leere Einnahmen/Ausgaben als Hinweis statt kaputter Tabelle", () => {
    const md = renderReportMarkdown(makeReport({ incomeRows: [], expenseRows: [] }));
    expect(md).toContain("_Keine Einnahmen mit Kategorie in diesem Monat._");
    expect(md).toContain("_Keine Ausgaben mit Kategorie in diesem Monat._");
    // Nachfolgende Abschnitte bleiben intakt
    expect(md).toContain("## Zusammenfassung");
  });
});

describe("renderReportCsv", () => {
  it("beginnt direkt mit dem Header ohne BOM", () => {
    const csv = renderReportCsv(makeReport());
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.startsWith("section,label,count,amount")).toBe(true);
  });

  it("nutzt Komma als Separator", () => {
    const csv = renderReportCsv(makeReport());
    const headerLine = csv.split("\r\n")[0];
    expect(headerLine).toBe("section,label,count,amount");
    expect(csv).toContain("Einnahmen,Einkommen,1,2000.00");
  });

  it("nutzt Punkt-Dezimal mit zwei Nachkommastellen", () => {
    const csv = renderReportCsv(makeReport());
    expect(csv).toContain("2000.00");
    expect(csv).toContain("-300.50");
  });

  it("quotet und escaped Felder mit Komma und Anführungszeichen", () => {
    const csv = renderReportCsv(makeReport());
    expect(csv).toContain('Konto,"Giro <Haupt> & ""Co"", DE",,');
  });

  it("weist Eigenübertragungen separat aus", () => {
    const csv = renderReportCsv(makeReport());
    expect(csv).toContain("Eigenübertragung,Eingehend,,500.00");
    expect(csv).toContain("Eigenübertragung,Ausgehend,,-500.00");
    expect(csv).toContain("Eigenübertragung,Netto,3,0.00");
  });

  it("rendert leere Kategoriezeilen ohne Header-Bruch", () => {
    const csv = renderReportCsv(makeReport({ incomeRows: [], expenseRows: [] }));
    expect(csv.startsWith("section,label,count,amount")).toBe(true);
    // Zusammenfassungs- und Transferzeilen bleiben vorhanden
    expect(csv).toContain("Zusammenfassung,Saldo,,1699.50");
    expect(csv).toContain("Eigenübertragung,Netto,3,0.00");
  });
});
