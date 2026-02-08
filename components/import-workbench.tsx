"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { parseSimpleTransactions, ParsedTransaction } from "@/lib/parse";

type ConflictDecision = "overwrite" | "discard" | "keep_both";

function buildFingerprint(tx: ParsedTransaction): string {
  return [tx.date, tx.amount.toFixed(2), tx.counterparty.toLowerCase(), tx.purpose.toLowerCase()].join("|");
}

const existingSample = new Set(["2025-02-01|-59.99|streamflix|abo februar"]);

export default function ImportWorkbench() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>({});

  const parsed = useMemo(() => parseSimpleTransactions(text), [text]);

  const withConflicts = parsed.map((tx) => {
    const fingerprint = buildFingerprint(tx);
    return { ...tx, fingerprint, conflict: existingSample.has(fingerprint) };
  });

  const conflicts = withConflicts.filter((t) => t.conflict);

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

  return (
    <div className="card">
      <h2>Import-Workbench</h2>
      <p>TXT per Drag-and-Drop oder Copy/Paste einfügen. Format pro Zeile:</p>
      <code>YYYY-MM-DD;Betrag;Gegenkonto;Verwendungszweck</code>

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

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="2025-02-01;-59.99;Streamflix;Abo Februar"
      />

      <section className="card" style={{ marginTop: "1rem" }}>
        <h3>Parser-Ergebnis ({withConflicts.length})</h3>
        {withConflicts.length === 0 ? <p>Noch keine validen Zeilen erkannt.</p> : null}
        <ul>
          {withConflicts.map((item) => (
            <li key={item.fingerprint + item.purpose}>
              {item.date} | {item.amount.toFixed(2)} € | {item.counterparty} | {item.purpose}
              {item.conflict ? " ⚠️ mögliches Duplikat" : ""}
            </li>
          ))}
        </ul>
      </section>

      {conflicts.length > 0 ? (
        <section className="dialog">
          <h3>Konflikte gefunden ({conflicts.length})</h3>
          {conflicts.map((item) => (
            <div key={item.fingerprint} style={{ marginBottom: "0.75rem" }}>
              <p>
                Datensatz bereits vorhanden: <strong>{item.date}</strong>, {item.amount.toFixed(2)} €, {item.counterparty}
              </p>
              <div className="inline-actions">
                <button onClick={() => setDecisions((prev) => ({ ...prev, [item.fingerprint]: "overwrite" }))}>
                  Überschreiben
                </button>
                <button
                  className="secondary"
                  onClick={() => setDecisions((prev) => ({ ...prev, [item.fingerprint]: "discard" }))}
                >
                  Verwerfen
                </button>
                <button onClick={() => setDecisions((prev) => ({ ...prev, [item.fingerprint]: "keep_both" }))}>
                  Beide behalten
                </button>
              </div>
              {decisions[item.fingerprint] ? <small>Entscheidung: {decisions[item.fingerprint]}</small> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
