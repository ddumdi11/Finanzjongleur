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
- Wertstellungsdatum
- Betrag
- Gläubiger-ID (`CRED`) **oder**
- normalisierter Merchant-Name
- Mandatsreferenz (`MREF`) (falls vorhanden)

---

### Instabile Felder (ignorieren)

- Laufende Referenznummern
- Terminal-IDs
- Uhrzeiten
- EREF (nur ergänzend nutzen)
- Layout- oder Zeilenumbrüche

---

### Empfohlener Dedup-Key (fachlich)

hash(
accountId +
wertstellungsdatum +
betrag +
(CRED || normalizedMerchantName) +
(MREF || "")
)

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

### Lösung: Zwei Ebenen

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
- Kleine Textänderung → neue Buchung
- Regel vorhanden → Kategorie automatisch gesetzt
- Keine Regel → Kategorie bleibt leer

---

## Status

Dieses Dokument beschreibt den **Soll-Zustand** des Systems.
Die technische Umsetzung folgt im Prisma-Schema und der Import-Logik.
