"use client";

import { ChangeEvent, DragEvent, useEffect, useState, useTransition } from "react";
import {
  detectVolksbankStatementYear,
  parseSimpleTransactions,
  parseVolksbankPaste,
  ParsedTransaction,
  VOLKSBANK_START_LINE,
} from "@/lib/parse";
import { looksLikeBunqCsv, parseBunqCsv } from "@/lib/parse-bunq";
import { looksLikePaypalCsv, parsePaypalCsv } from "@/lib/parse-paypal";

type AccountOption = {
  id: string;
  name: string;
  type: string;
  currency: string;
};

type ImportWorkbenchProps = {
  accounts: AccountOption[];
  createImportedTransactionsAction: (
    accountId: string,
    parsedTransactions: ParsedTransaction[]
  ) => Promise<{
    importedCount: number;
    skippedCount?: number;
    totalCount?: number;
    error?: string;
  }>;
  extractPdfTextAction: (
    formData: FormData
  ) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
};

function looksLikeVolksbankPaste(input: string): boolean {
  const matches = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => VOLKSBANK_START_LINE.test(line)).length;

  return matches >= 3;
}

export default function ImportWorkbench({
  accounts,
  createImportedTransactionsAction,
  extractPdfTextAction,
}: ImportWorkbenchProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [yearOverride, setYearOverride] = useState("");
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [mode, setMode] = useState<"volksbank" | "bunq" | "paypal" | "csv">("csv");
  const [volksbankYear, setVolksbankYear] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, startImportTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      if (looksLikeBunqCsv(text)) {
        setMode("bunq");
        setVolksbankYear(null);
        setParsed(parseBunqCsv(text));
        return;
      }

      if (looksLikePaypalCsv(text)) {
        setMode("paypal");
        setVolksbankYear(null);
        setParsed(parsePaypalCsv(text));
        return;
      }

      const useVolksbankParser = looksLikeVolksbankPaste(text);
      setMode(useVolksbankParser ? "volksbank" : "csv");

      if (useVolksbankParser) {
        const overrideYearNumber = Number(yearOverride);
        const hasValidOverride = Number.isInteger(overrideYearNumber) && overrideYearNumber >= 1900 && overrideYearNumber <= 2099;
        const year = hasValidOverride ? overrideYearNumber : detectVolksbankStatementYear(text);
        setVolksbankYear(year);
        setParsed(parseVolksbankPaste(text, year));
      } else {
        setVolksbankYear(null);
        setParsed(parseSimpleTransactions(text));
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [text, yearOverride]);

  const onFile = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractPdfTextAction(formData);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setFileName(file.name);
      setText(result.text);
      return;
    }

    const content = await file.text();
    setFileName(file.name);
    setText(content);
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) await onFile(file);
  };

  const onSelectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await onFile(file);
  };

  const canImport = parsed.length > 0 && selectedAccountId.length > 0 && !isImporting;

  const onImport = () => {
    if (!canImport) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    startImportTransition(async () => {
      try {
        const result = await createImportedTransactionsAction(selectedAccountId, parsed);
        if (result.error) {
          setErrorMessage(result.error);
          return;
        }

        const skipped = result.skippedCount ?? 0;
        const summary =
          skipped > 0
            ? `${result.importedCount} Buchungen importiert, ${skipped} Duplikate übersprungen`
            : `${result.importedCount} Buchungen importiert`;
        setSuccessMessage(summary);
        setText("");
        setFileName(null);
        setParsed([]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import fehlgeschlagen.";
        setErrorMessage(message);
      }
    });
  };

  return (
    <div className="card">
      <h2>Import-Workbench</h2>
      <p>
        PDF, TXT oder CSV per Drag-and-Drop ablegen — alternativ einfach
        hineinkopieren.
      </p>
      <p>
        Auto-Erkennung: Volksbank-Auszug (PDF oder Paste mit mind. 3
        Startzeilen), bunq-CSV-Export (Semikolon-getrennt, mit Header
        <code>Date;Interest Date;Amount;Counterparty;Name;Description</code>),
        PayPal-CSV-Export (Komma-getrennt, deutscher Header mit
        <code>Datum,Beschreibung,Brutto,Name,Transaktionscode,…</code>)
        oder CSV-Fallback
        <br />
        <code>YYYY-MM-DD;Betrag;Gegenkonto;Verwendungszweck</code>
      </p>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{ marginTop: "1rem" }}
      >
        <label htmlFor="fileInput">
          Datei hier hineinziehen oder <strong>Datei wählen</strong>.
        </label>
        <input id="fileInput" type="file" accept=".pdf,.txt,.csv" onChange={onSelectFile} />
        {fileName ? <p>Geladen: {fileName}</p> : null}
      </div>

      <label htmlFor="yearOverride">Jahr (optional)</label>
      <input
        id="yearOverride"
        type="number"
        min={1900}
        max={2099}
        step={1}
        value={yearOverride}
        onChange={(e) => setYearOverride(e.target.value)}
        placeholder="z. B. 2025"
        style={{ display: "block", width: "10rem", marginTop: "0.25rem", marginBottom: "0.75rem" }}
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Volksbank-Paste oder CSV einfügen"
      />

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Erkannte Buchungen ({parsed.length})</h3>
        <p>
          Parser:{" "}
          {mode === "volksbank"
            ? `Volksbank-Paste (Jahr ${volksbankYear ?? new Date().getFullYear()})`
            : mode === "bunq"
              ? "bunq-CSV"
              : mode === "paypal"
                ? "PayPal-CSV"
                : "CSV-Fallback"}
        </p>
        {parsed.length === 0 ? <p>Noch keine validen Buchungen erkannt.</p> : null}
        <ul>
          {parsed.map((item, index) => (
            <li key={`${item.bookingDateISO}-${item.amount}-${index}`}>
              {item.bookingDateISO} | {item.amount.toFixed(2)} € | {item.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Import</h3>
        <label htmlFor="accountId">Konto auswählen</label>
        <select
          id="accountId"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          style={{ display: "block", marginTop: "0.25rem", marginBottom: "0.75rem" }}
        >
          <option value="">Bitte Konto wählen</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.type}, {account.currency})
            </option>
          ))}
        </select>

        <button type="button" onClick={onImport} disabled={!canImport}>
          {isImporting ? "Importiere..." : "Buchungen importieren"}
        </button>

        {successMessage ? <p>{successMessage}</p> : null}
        {errorMessage ? <p>{errorMessage}</p> : null}
      </section>
    </div>
  );
}
