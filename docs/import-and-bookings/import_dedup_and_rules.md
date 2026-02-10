# Import, Buchungen, Dedup & Regeln – Fachliches Verhalten

## Ziel dieses Dokuments

Dieses Dokument beschreibt das fachliche Verhalten des Finanzsystems beim Import von Bankdaten:

- wie Buchungen entstehen
- wie Duplikate vermieden werden
- wie Kategorien vergeben werden
- und wie Regeln künftig abgeleitet werden sollen

Es dient als **Referenz für Implementierung, Tests und Codex-Prompts**.

---

## 1. Begriffe & Abgrenzung

### Import

- Technischer Vorgang
- Liest Rohdaten (CSV, Copy&Paste, PDF-Parser)
- Erkennt potenzielle Buchungen
- Erstellt **Transactions (Buchungen)**

👉 Import **interpretiert nicht**.

---

### Transaction / Buchung

- Fachliche Repräsentation einer Kontobewegung
- Enthält:
  - Datum (Wertstellung)
  - Betrag
  - Buchungsart
  - Beschreibung (normalisiert)
  - optionale Referenzen (EREF, MREF, CRED)
  - Kategorie / Subkategorie (optional)

👉 Buchungen sind **append-only**.

---

## 2. Dedup-Strategie (Idempotenz)

### Ziel

- Gleiche reale Buchung soll **nur einmal** entstehen
- Kleine Textänderungen der Bank dürfen **keine neuen Duplikate erzeugen**

---

### Stabile Felder (für Dedup geeignet)

- accountId
- bookingDateISO
- valueDateISO
- amount (fixed auf 2 Nachkommastellen)
- description (trimmed + lowercased)
- memoRaw (trimmed + lowercased)

---

### Instabile Felder (ignorieren)

- Laufende Referenznummern
- Terminal-IDs
- Uhrzeiten
- Layout- oder Zeilenumbrüche

---

### Empfohlener Dedup-Key (fachlich)

hash(
accountId +
bookingDateISO +
valueDateISO +
amount.toFixed(2) +
description.trim().toLowerCase() +
memoRaw.trim().toLowerCase()
)

Die Teile werden mit `|` verbunden und anschließend gehasht.

Hinweis Migrationen / Dedup: Die Migration legt einen UNIQUE Index auf `(accountId, fingerprint)` an und kann fehlschlagen, wenn die DB bereits Dubletten enthält (z. B. durch Re-Import vor Dedup). In diesem Fall DB bereinigen/resetten oder deduplizieren, dann Migration erneut ausführen.

---

## 3. Jahr-Override

- Optionales Jahr beim Import
- Führt bewusst zu **neuen Buchungen**
- Auch bei sonst identischen Daten

👉 Jahr ist **Teil der fachlichen Identität**, nicht des Duplikatschutzes.

---

## 4. Kategorien-Modell

### Problem

Eine einzelne Kategorie (z. B. `INSURANCE`) ist fachlich zu grob.

---

### Lösung (fachlich, Zielbild): Zwei Ebenen

#### Category (Budget-Ebene)

- INSURANCE
- RENT
- CASH
- TRANSFER
- GROCERIES
- ENERGY
- SUBSCRIPTIONS
- etc.

#### Subcategory / Tag (Bedeutung)

- HEALTH_DENTAL
- HEALTH_SUPPLEMENTARY
- DEVICE_NOTEBOOK
- MUSIC_STREAMING
- CLOUD_HOSTING
- etc.

👉 Kategorie = „Wofür?“  
👉 Subkategorie = „Welche Art genau?“

Aktueller Stand im Schema: Es gibt derzeit nur `Transaction.category`. Subcategory/Tag ist geplant, aber noch nicht umgesetzt.

---

## 5. Regeln (zukünftiges Verhalten)

### Grundsatz

Regeln werden **nicht beim Import erraten**, sondern:

- explizit aus bestätigten Buchungen abgeleitet
- gelten nur für **zukünftige** Buchungen

---

### Regel-Inhalt (fachlich)

Eine Regel speichert:

- Match-Kriterien:
  - CRED
  - optional MREF
  - optional Betrag (+/- Toleranz)
  - optional normalisierter Merchant
- Ziel:
  - Category
  - Subcategory

---

### Regel-Verhalten

- Neue Buchung trifft Regel → Kategorie wird automatisch gesetzt
- Bestehende Buchungen bleiben **unangetastet**

---

## 6. Wichtige Design-Prinzipien

- Import zerstört niemals Nutzerentscheidungen
- Kategorien werden nie automatisch überschrieben
- Append-only-Logik für Nachvollziehbarkeit
- Fachliche Korrektheit > Bequemlichkeit
- Konservatives Verhalten ist erwünscht

---

## 7. Testfälle (Kurzfassung)

- Import (neu) → Buchungen entstehen
- Import (gleich) → 0 neue Buchungen
- Import mit Jahr-Override → neue Buchungen
- Kleine Textänderung (z. B. zusätzliche Leerzeichen/Zeilenumbrüche/Bank-Variante) → kein neues Duplikat
- Regel vorhanden → Kategorie automatisch gesetzt
- Keine Regel → Kategorie bleibt leer

---

## Status

Dieses Dokument beschreibt den **Soll-Zustand** des Systems.
Die technische Umsetzung folgt im Prisma-Schema und der Import-Logik.
