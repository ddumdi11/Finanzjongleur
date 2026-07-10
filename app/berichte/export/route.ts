import { buildMonthlyReport, type MonthlyReport } from "@/lib/report-data";
import { renderReportHtml, renderReportMarkdown, renderReportCsv } from "@/lib/report-format";

/**
 * Export-Route für die Monatsauswertung.
 *
 * GET /berichte/export?month=YYYY-MM&account=<id>&format=html|markdown|csv
 *
 * Bewusst ohne eigene Berichtlogik: die Route liest nur die Query, ruft
 * `buildMonthlyReport` (dieselbe Aggregation wie die Seite `/berichte`) und
 * den passenden reinen Renderer aus `lib/report-format.ts` auf und verpackt
 * das Ergebnis als Datei-Download. `month`/`account` sind exakt die Parameter,
 * die auch die Berichte-Seite nutzt.
 */

// DB-gestützt und pro Aufruf frisch — nie statisch cachen.
export const dynamic = "force-dynamic";

type ExportFormat = "html" | "markdown" | "csv";

/** Erlaubte `format`-Werte inkl. Aliase → kanonisches Format. */
const FORMAT_ALIASES: Record<string, ExportFormat> = {
  html: "html",
  htm: "html",
  markdown: "markdown",
  md: "markdown",
  csv: "csv",
};

/** Content-Type, Dateiendung und Renderer je Format. */
const FORMAT_META: Record<
  ExportFormat,
  { contentType: string; ext: string; render: (report: MonthlyReport) => string }
> = {
  html: { contentType: "text/html; charset=utf-8", ext: "html", render: renderReportHtml },
  markdown: { contentType: "text/markdown; charset=utf-8", ext: "md", render: renderReportMarkdown },
  csv: { contentType: "text/csv; charset=utf-8", ext: "csv", render: renderReportCsv },
};

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // Default-Format ist HTML, wenn `format` fehlt.
  const formatParam = (searchParams.get("format") ?? "html").trim().toLowerCase();
  const format = FORMAT_ALIASES[formatParam];
  if (!format) {
    return textResponse("Ungültiges Format. Erlaubt sind: html, markdown, csv.", 400);
  }

  // Dieselben Query-Parameter wie die Berichte-Seite; leere Werte = Default
  // (aktueller Monat bzw. alle Konten) übernimmt `buildMonthlyReport`.
  const month = searchParams.get("month") ?? undefined;
  const account = searchParams.get("account") ?? undefined;

  try {
    const report = await buildMonthlyReport({ month, account });
    const meta = FORMAT_META[format];
    const body = meta.render(report);
    const filename = `finanzbericht-${report.monthKey}.${meta.ext}`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    // Keine Details/Stacktraces nach außen geben.
    return textResponse("Bericht konnte nicht erstellt werden.", 500);
  }
}
