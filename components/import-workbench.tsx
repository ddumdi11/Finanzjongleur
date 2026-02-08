"use client";

import { ChangeEvent, DragEvent, useEffect, useState, useTransition } from "react";
import { detectVolksbankStatementYear, parseSimpleTransactions, parseVolksbankPaste, ParsedTransaction } from "@/lib/parse";

const VOLKSBANK_START_LINE = /^\d{2}\.\d{2}(?:\.\d{4})?\.?\s+\d{2}\.\d{2}(?:\.\d{4})?\.?/;

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
  ) => Promise<{ importedCount: number }>;
};

function looksLikeVolksbankPaste(input: string): boolean {
  const matches = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => VOLKSBANK_START_LINE.test(line)).length;

  return matches >= 3;
}

export default function ImportWorkbench({ accounts, createImportedTransactionsAction }: ImportWorkbenchProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [yearOverride, setYearOverride] = useState("");
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [mode, setMode] = useState<"volksbank" | "csv">("csv");
  const [volksbankYear, setVolksbankYear] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, startImportTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
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
        setSuccessMessage(`${result.importedCount} Buchungen importiert`);
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
      <p>TXT per Drag-and-Drop oder Copy/Paste einfügen.</p>
      <p>
        Auto-Erkennung: Volksbank-Paste (mind. 3 Startzeilen) oder CSV-Fallback
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
        <input id="fileInput" type="file" accept=".txt,.csv" onChange={onSelectFile} />
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
          {mode === "volksbank" ? `Volksbank-Paste (Jahr ${volksbankYear ?? new Date().getFullYear()})` : "CSV-Fallback"}
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
