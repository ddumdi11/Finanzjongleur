import type { CategoryRow, MonthlyReport } from "./report-data";
import { transactionCategoryLabels } from "./category-labels";

/**
 * Reine Renderer für den Berichtsexport (Phase B).
 *
 * Alle drei Funktionen nehmen ausschließlich ein bereits aufbereitetes
 * `MonthlyReport` (aus `lib/report-data.ts`) entgegen und geben einen String
 * zurück — kein Prisma, kein DB-Zugriff, keine eigene Aggregationslogik. Sie
 * dienen nur der Darstellung; die Trennung der Eigenübertragungen aus den
 * Hauptsummen ist bereits in `report-data.ts` passiert und wird hier nur
 * separat ausgewiesen, nie erneut verrechnet.
 */

/** Deutsches Anzeige-Label einer Kategorie, mit Fallback auf den Rohwert. */
function categoryLabel(category: CategoryRow["category"]): string {
  return transactionCategoryLabels[category] ?? String(category);
}

/** Anzeige-Name des gewählten Kontos bzw. „Alle Konten“. */
function accountLabel(report: MonthlyReport): string {
  return report.accountName ?? "Alle Konten";
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Schlichtes, druckfreundliches Inline-CSS für das eigenständige Dokument. */
const HTML_STYLE = `
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.75rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
    th, td { padding: 0.25rem 0.5rem; text-align: left; }
    th.amount, td.amount { text-align: right; }
    th.count, td.count { text-align: right; }
    tbody tr:nth-child(even) { background: #f6f6f6; }
    .muted { color: #666; }
    .warn { color: #8a5300; }
`;

/**
 * Baut eine HTML-Kategorietabelle oder – bei leeren Zeilen – einen Hinweis.
 * `money` liefert den bereits HTML-escapten Betrag im Währungsformat des Berichts.
 */
function htmlCategoryTable(rows: CategoryRow[], emptyMessage: string, money: (value: number) => string): string {
  if (rows.length === 0) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(categoryLabel(row.category))}</td>` +
        `<td class="count">${row.count}</td>` +
        `<td class="amount">${money(row.sum)}</td></tr>`,
    )
    .join("\n");
  return (
    `<table>\n<thead><tr><th>Kategorie</th><th class="count">Anzahl</th>` +
    `<th class="amount">Betrag</th></tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`
  );
}

export function renderReportHtml(report: MonthlyReport): string {
  const currency = report.currency;
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency });
  // Lokaler Formatter, damit die Währung des konkreten Berichts genutzt wird.
  const money = (value: number) => escapeHtml(fmt.format(value));

  const title = `Finanzbericht ${report.monthTitle}`;

  const summaryTable =
    `<table>\n<tbody>\n` +
    `<tr><td>Einnahmen</td><td class="amount">${money(report.incomeTotal)}</td></tr>\n` +
    `<tr><td>Ausgaben</td><td class="amount">${money(report.expenseTotal)}</td></tr>\n` +
    `<tr><td><strong>Saldo</strong></td><td class="amount"><strong>${money(report.saldo)}</strong></td></tr>\n` +
    `</tbody>\n</table>`;

  const transfersBlock =
    report.internalTransfers.count === 0
      ? `<p class="muted">Keine Eigenübertragungen in diesem Monat.</p>`
      : `<p class="muted">Nicht in Einnahmen, Ausgaben und Saldo enthalten — nur Verschiebungen zwischen eigenen Konten.</p>\n` +
        `<table>\n<tbody>\n` +
        `<tr><td>Eingehend</td><td class="amount">${money(report.internalTransfers.incomeSum)}</td></tr>\n` +
        `<tr><td>Ausgehend</td><td class="amount">${money(report.internalTransfers.expenseSum)}</td></tr>\n` +
        `<tr><td><strong>Netto</strong> (${report.internalTransfers.count} Buchung${report.internalTransfers.count === 1 ? "" : "en"})</td>` +
        `<td class="amount"><strong>${money(report.internalTransfers.netSum)}</strong></td></tr>\n` +
        `</tbody>\n</table>`;

  const comparisonRows = report.comparison
    .map((row) => {
      const delta = row.current - row.previous;
      return (
        `<tr><td>${escapeHtml(row.label)}</td>` +
        `<td class="amount">${money(row.current)}</td>` +
        `<td class="amount">${money(row.previous)}</td>` +
        `<td class="amount">${money(delta)}</td></tr>`
      );
    })
    .join("\n");

  const comparisonTable =
    `<table>\n<thead><tr><th></th>` +
    `<th class="amount">${escapeHtml(report.monthTitle)}</th>` +
    `<th class="amount">${escapeHtml(report.prevMonthTitle)}</th>` +
    `<th class="amount">Delta</th></tr></thead>\n<tbody>\n${comparisonRows}\n</tbody>\n</table>`;

  const mixedWarning = report.mixedCurrencyWarning
    ? `<p class="warn">Hinweis: Über mehrere Konten mit unterschiedlichen Währungen zusammengefasst in ${escapeHtml(currency)}.</p>\n`
    : "";

  const uncategorized =
    report.uncategorized.count === 0
      ? `<p class="muted">Alle Buchungen dieses Monats sind kategorisiert.</p>`
      : `<p>${report.uncategorized.count} Buchung${report.uncategorized.count === 1 ? "" : "en"} ohne Kategorie · Summe ${money(report.uncategorized.sum)}</p>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="muted">Konto: ${escapeHtml(accountLabel(report))}</p>
${mixedWarning}<h2>Einnahmen</h2>
${htmlCategoryTable(report.incomeRows, "Keine Einnahmen mit Kategorie in diesem Monat.", money)}
<h2>Ausgaben</h2>
${htmlCategoryTable(report.expenseRows, "Keine Ausgaben mit Kategorie in diesem Monat.", money)}
<h2>Zusammenfassung</h2>
${summaryTable}
<h2>Unkategorisiert</h2>
${uncategorized}
<h2>Eigenübertragungen</h2>
${transfersBlock}
<h2>Vergleich mit Vormonat</h2>
${comparisonTable}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Escaped nur, was eine Markdown-Tabellenzelle zerstören würde. */
function escapeMarkdown(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** Baut eine Markdown-Kategorietabelle oder – bei leeren Zeilen – einen Hinweis. */
function markdownCategoryTable(rows: CategoryRow[], emptyMessage: string, money: (v: number) => string): string {
  if (rows.length === 0) {
    return `_${emptyMessage}_`;
  }
  const header = "| Kategorie | Anzahl | Betrag |\n| --- | ---: | ---: |";
  const body = rows
    .map((row) => `| ${escapeMarkdown(categoryLabel(row.category))} | ${row.count} | ${escapeMarkdown(money(row.sum))} |`)
    .join("\n");
  return `${header}\n${body}`;
}

export function renderReportMarkdown(report: MonthlyReport): string {
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: report.currency });
  const money = (value: number) => fmt.format(value);
  const cell = (value: number) => escapeMarkdown(money(value));

  const lines: string[] = [];

  lines.push(`# Finanzbericht ${escapeMarkdown(report.monthTitle)}`);
  lines.push("");
  lines.push(`Konto: ${escapeMarkdown(accountLabel(report))}`);
  if (report.mixedCurrencyWarning) {
    lines.push("");
    lines.push(`> Hinweis: Über mehrere Konten mit unterschiedlichen Währungen zusammengefasst in ${report.currency}.`);
  }

  lines.push("");
  lines.push("## Einnahmen");
  lines.push(markdownCategoryTable(report.incomeRows, "Keine Einnahmen mit Kategorie in diesem Monat.", money));

  lines.push("");
  lines.push("## Ausgaben");
  lines.push(markdownCategoryTable(report.expenseRows, "Keine Ausgaben mit Kategorie in diesem Monat.", money));

  lines.push("");
  lines.push("## Zusammenfassung");
  lines.push("| Position | Betrag |");
  lines.push("| --- | ---: |");
  lines.push(`| Einnahmen | ${cell(report.incomeTotal)} |`);
  lines.push(`| Ausgaben | ${cell(report.expenseTotal)} |`);
  lines.push(`| **Saldo** | ${cell(report.saldo)} |`);

  lines.push("");
  lines.push("## Unkategorisiert");
  if (report.uncategorized.count === 0) {
    lines.push("_Alle Buchungen dieses Monats sind kategorisiert._");
  } else {
    lines.push(
      `${report.uncategorized.count} Buchung${report.uncategorized.count === 1 ? "" : "en"} ohne Kategorie · Summe ${money(report.uncategorized.sum)}`,
    );
  }

  lines.push("");
  lines.push("## Eigenübertragungen");
  if (report.internalTransfers.count === 0) {
    lines.push("_Keine Eigenübertragungen in diesem Monat._");
  } else {
    lines.push("_Nicht in Einnahmen, Ausgaben und Saldo enthalten._");
    lines.push("");
    lines.push("| Position | Anzahl | Betrag |");
    lines.push("| --- | ---: | ---: |");
    lines.push(`| Eingehend |  | ${cell(report.internalTransfers.incomeSum)} |`);
    lines.push(`| Ausgehend |  | ${cell(report.internalTransfers.expenseSum)} |`);
    lines.push(`| **Netto** | ${report.internalTransfers.count} | ${cell(report.internalTransfers.netSum)} |`);
  }

  lines.push("");
  lines.push("## Monatsvergleich");
  lines.push(`| Position | ${escapeMarkdown(report.monthTitle)} | ${escapeMarkdown(report.prevMonthTitle)} | Delta |`);
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of report.comparison) {
    const delta = row.current - row.previous;
    lines.push(`| ${escapeMarkdown(row.label)} | ${cell(row.current)} | ${cell(row.previous)} | ${cell(delta)} |`);
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CSV (neutraler Standard: Komma-Separator, Punkt-Dezimal, kein BOM)
// ---------------------------------------------------------------------------

/** Beträge stabil mit Punkt-Dezimaltrenner und zwei Nachkommastellen. */
function formatCsvAmount(value: number): string {
  // `+value` normalisiert -0 zu 0, damit nie "-0.00" entsteht.
  return (value + 0).toFixed(2);
}

/** Ein Feld nach RFC 4180 quoten, falls Komma, Anführungszeichen oder Umbruch enthalten sind. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Reine, menschliche Formatierung nutzt Intl (für HTML/Markdown). Für CSV nur
 * die stabilen Rohbeträge — bewusst ohne Währungssymbol/Tausenderpunkt, damit
 * die Werte maschinell weiterverarbeitbar bleiben.
 */
export function renderReportCsv(report: MonthlyReport): string {
  const rows: string[][] = [["section", "label", "count", "amount"]];

  rows.push(["Konto", accountLabel(report), "", ""]);

  for (const row of report.incomeRows) {
    rows.push(["Einnahmen", categoryLabel(row.category), String(row.count), formatCsvAmount(row.sum)]);
  }
  for (const row of report.expenseRows) {
    rows.push(["Ausgaben", categoryLabel(row.category), String(row.count), formatCsvAmount(row.sum)]);
  }

  rows.push([
    "Unkategorisiert",
    "Unkategorisiert",
    String(report.uncategorized.count),
    formatCsvAmount(report.uncategorized.sum),
  ]);

  rows.push(["Eigenübertragung", "Eingehend", "", formatCsvAmount(report.internalTransfers.incomeSum)]);
  rows.push(["Eigenübertragung", "Ausgehend", "", formatCsvAmount(report.internalTransfers.expenseSum)]);
  rows.push([
    "Eigenübertragung",
    "Netto",
    String(report.internalTransfers.count),
    formatCsvAmount(report.internalTransfers.netSum),
  ]);

  rows.push(["Zusammenfassung", "Einnahmen", "", formatCsvAmount(report.incomeTotal)]);
  rows.push(["Zusammenfassung", "Ausgaben", "", formatCsvAmount(report.expenseTotal)]);
  rows.push(["Zusammenfassung", "Saldo", "", formatCsvAmount(report.saldo)]);

  for (const row of report.comparison) {
    rows.push(["Vergleich", `${row.label} (${report.monthTitle})`, "", formatCsvAmount(row.current)]);
    rows.push(["Vergleich", `${row.label} (${report.prevMonthTitle})`, "", formatCsvAmount(row.previous)]);
  }

  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}
