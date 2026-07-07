# ADR 0003 – Forecast und wiederkehrende Zahlungen

## Status

Accepted – 2026-04-21

### Festgelegte Entscheidungen zu den offenen Fragen

1. **Forecast kontoübergreifend mit Filter-Option** (nicht pro Konto)
2. **Quelle der Auto-Vorschläge sichtbar** als kleiner Info-Text pro Eintrag
3. **Wacklige Vorschläge (Konfidenz 30–50) für den Einstieg weglassen**; Schwelle bleibt bei ≥ 50. Lässt sich später aufweichen, ohne das Datenmodell zu ändern.
4. **Hinweis bei Jahreszahlungen** im manuellen Formular einblenden
5. **Auto-Erkennung zunächst nur manuell per Button**, nicht automatisch nach jedem Import

## Kontext

Das ursprüngliche Ziel von Finanzjongleur war, einen **Überblick über erwartete Abbuchungen** zu bekommen: Welche Kosten kommen wann auf das Konto zu? Genau dieses Feature ist auch in `docs/architecture-plan.md` als "3) Wiederkehrende Ausgaben verwalten" und "5) Erinnerungen & Warnungen" festgehalten.

Der bisherige Entwicklungsverlauf hat ein solides Fundament geschaffen, aber dieses Kernziel noch nicht berührt:

* Import von Volksbank-Auszügen funktioniert (Paste + einfaches CSV)
* Persistenz via Prisma/SQLite ist etabliert
* Dedup-Fingerprint und manuelle Kategorisierung sind vorhanden
* Merchant-Normalisierung (`lib/merchant.ts`) filtert IBAN/BIC/Rauschen sauber

Was **fehlt**:

* Im Datenmodell gibt es kein Konzept für "wiederkehrende Zahlung" oder "erwartete Buchung"
* In der UI gibt es keine Forecast-Ansicht
* Der praktische Nutzen für den Alltagsgebrauch ist dadurch nicht gegeben, obwohl die Dateninfrastruktur es hergäbe

Parallel bestehen zwei dokumentierte, kleine Baustellen, die für eine saubere Basis vorher gefixt werden sollten:

* `app/accounts/page.tsx` nutzt noch Demo-Daten statt Prisma-Abfrage
* `app/import/actions.ts` nutzt `createMany()`, entgegen der in [ADR 0002](./0002-sqlite-import-strategy.md) festgelegten idempotenten Zeilen-Import-Strategie

Zusätzlich liegen 17 Monate historischer Kontoauszüge als geschwärzte PDFs bereit (Okt 2024 – Feb 2026), die als Datenbasis für Parser-Verifikation und Auto-Erkennung dienen können.

## Scope

### In Scope

* Neues Datenmodell `RecurringPayment` für geplante und erkannte wiederkehrende Zahlungen
* Forecast-Seite: Listendarstellung der nächsten erwarteten Buchungen (30/60/90 Tage)
* Manuelle Erfassung einzelner wiederkehrender Zahlungen
* Auto-Erkennung wiederkehrender Zahlungen aus bestehenden Buchungen (als Vorschläge zur Bestätigung)
* PDF-Upload in der Import-Workbench (zusätzlich zu bestehendem Paste/CSV)
* Fix der zwei bestehenden Altlasten (Import-Idempotenz, Accounts-Seite)

### Out of Scope (für diese Iteration)

* Live-Abgleich "erwartet vs. tatsächlich" nach Eingang einer Buchung (Folge-ADR)
* Budget pro Kategorie und Schwellwert-Warnungen
* Kalender-Visualisierung (Liste zuerst, Kalender optional später)
* PostgreSQL-Migration
* KI-gestützte Kategorisierung über OpenRouter

## Entscheidung

### 1. Datenmodell

Neue Prisma-Tabelle `RecurringPayment`:

```prisma
model RecurringPayment {
  id               String          @id @default(cuid())
  accountId        String
  label            String                                  // z. B. "Miete", "Strom E.ON", "Netflix"

  // Betrag
  expectedAmount   Decimal                                 // typischer Betrag
  amountTolerance  Decimal         @default(0)             // erlaubter Schwankungsspielraum (+/-)
  currency         String          @default("EUR")

  // Periodizität
  periodicity      RecurrenceKind                          // MONTHLY, QUARTERLY, YEARLY, CUSTOM
  intervalDays     Int?                                    // nur bei CUSTOM
  dayOfMonth       Int?                                    // bei MONTHLY/QUARTERLY: z. B. 1
  anchorDate       DateTime                                // Referenzpunkt fuer Berechnung

  // Matching
  merchantKey      String?                                 // normalisierter Merchant aus lib/merchant.ts
  category         TransactionCategory?

  // Status
  isActive         Boolean         @default(true)
  nextExpectedDate DateTime?                               // persistiert fuer schnellen Query
  source           RecurringSource @default(MANUAL)        // MANUAL oder AUTO_DETECTED
  confidence       Int?                                    // nur bei AUTO_DETECTED: 0-100
  confirmedAt      DateTime?                               // null = unbestaetigter Vorschlag

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  account          Account         @relation(fields: [accountId], references: [id])

  @@index([accountId, isActive])
  @@index([nextExpectedDate])
}

enum RecurrenceKind {
  MONTHLY
  QUARTERLY
  YEARLY
  CUSTOM
}

enum RecurringSource {
  MANUAL
  AUTO_DETECTED
}
```

**Begründung einzelner Felder:**

* `nextExpectedDate` wird denormalisiert gespeichert, damit die Forecast-Liste ohne Rechnung-pro-Zeile gelesen werden kann. Neuberechnung erfolgt beim Anlegen, Bearbeiten, Bestätigen und per Daily-Job (oder beim Seitenaufruf, solange der Datenstand klein ist).
* `confirmedAt = null` trennt Vorschläge (Auto-Erkennung) von echten, bestätigten Einträgen. Nur bestätigte Einträge erscheinen im Forecast.
* `amountTolerance` erlaubt es, reale Schwankungen (z. B. Strom-Abschlag, Versicherungsprämien) explizit einzuplanen, ohne als Abweichung zu gelten.
* `merchantKey` verbindet den Eintrag mit der bereits bestehenden Merchant-Normalisierung aus `lib/merchant.ts` und erlaubt in einem Folge-ADR den Live-Abgleich mit eingehenden Buchungen.

### 2. Forecast-Berechnung

Für einen `RecurringPayment` gilt:

* `periodicity = MONTHLY`: nächstes Datum = `anchorDate` plus n Monate, so dass Ergebnis >= heute; auf `dayOfMonth` geclippt
* `periodicity = QUARTERLY`: analog, +n·3 Monate
* `periodicity = YEARLY`: analog, +n Jahre
* `periodicity = CUSTOM`: nächstes Datum = `anchorDate` plus n · `intervalDays`

Ausgabe der Forecast-Seite: alle aktiven Einträge (`isActive = true`, `confirmedAt != null`) mit `nextExpectedDate <= heute + horizon`.

### 3. Auto-Erkennungs-Algorithmus

Über alle Buchungen des gewählten Kontos:

1. **Gruppierung**: Schlüssel = `normalizeMerchant(counterparty) + "|" + normalizeMerchant(purpose_short)`. `purpose_short` ist der erste Zeilen-Anteil des Verwendungszwecks (ohne EREF/MREF-Referenzen), um z. B. zwei unterschiedliche Amazon-Käufe nicht fälschlich zu clustern.
2. **Vorfilter**: Nur Gruppen mit mindestens 3 Buchungen und mindestens 60 Tagen Zeitspanne werden weiter analysiert.
3. **Periodizitätserkennung**: Berechne Median der Tagesabstände zwischen aufeinanderfolgenden Buchungen einer Gruppe.
   * Median in 28..31 → `MONTHLY`
   * Median in 88..95 → `QUARTERLY`
   * Median in 358..368 → `YEARLY`
   * Sonst → `CUSTOM` mit `intervalDays = median`
4. **Betrags-Robustheit**: Median und Streuung über alle Beträge. Median wird als `expectedAmount` gesetzt; Streuung fließt in die Konfidenz ein.
5. **Konfidenz** (0–100), Formel-Skizze:
   * Basis: min(Anzahl Buchungen × 10, 60)
   * Bonus +20 bei geringer Perioden-Streuung (Std.Abw. < 10 % des Medians)
   * Bonus +20 bei geringer Betrags-Streuung (Std.Abw. < 10 % des Medians)
   * Ergebnis auf 0..100 geclippt
6. **Schwelle**: Gruppen mit Konfidenz >= 50 werden als `RecurringPayment` mit `source = AUTO_DETECTED`, `confirmedAt = null` gespeichert. Andere werden verworfen (oder als schwache Vorschläge mit Hinweis angezeigt — entscheidet UI).

Bei jeder Erkennungsrunde wird bereits bestehende Vorschläge (confirmedAt = null) des gleichen Merchant-Keys überschrieben, bestätigte Einträge bleiben unangetastet.

**Wichtige Einschränkung**: Jährliche Zahlungen sind aus nur einem Jahr Historie nicht erkennbar (nur eine Messung, keine Periodizität nachweisbar). Diese müssen manuell ergänzt werden, bis zwei Jahre Daten vorliegen.

### 4. PDF-Import

Der bestehende `parseVolksbankPaste` in `lib/parse.ts` erkennt das Format `DD.MM. DD.MM. <desc> <amount> S/H`, das auch die Textextraktion aus den Volksbank-PDFs liefert. Minimale Anpassungen können nötig sein (z. B. Tolerierung unerwarteter Header-Zeilen, gesperrt gesetzte Bank-Identifikation wie "V o lk s b a n k").

Für PDF → Text im Node-Stack wird `pdf-parse` (einfach, gut getestet, wenige Abhängigkeiten) eingebunden. Alternativ `pdfjs-dist`, falls `pdf-parse` mit Edge-Cases stolpert.

Erweiterung der Import-Workbench: Upload-Dateityp `.pdf` wird akzeptiert, Server Action extrahiert Text → `parseVolksbankPaste` → bestehender Import-Pfad.

Verifikation: die 17 vorhandenen redigierten Monats-PDFs (Okt 2024 – Feb 2026) als Smoke-Test-Korpus.

### 5. UI

Neue/geänderte Seiten:

* `app/forecast/page.tsx` (neu): Tabelle der nächsten erwarteten Buchungen, gruppiert nach Monat. Toggle 30/60/90 Tage. Summe pro Zeitraum am Ende. Ein Link "Neu anlegen" + "Vorschläge ansehen".
* `app/forecast/neu/page.tsx` (neu): Formular zur manuellen Anlage eines `RecurringPayment`.
* `app/forecast/vorschlaege/page.tsx` (neu): Liste aller Auto-Vorschläge (`confirmedAt = null`). Pro Eintrag: Aktionen "Bestätigen", "Bearbeiten & Bestätigen", "Verwerfen". Pro Eintrag sichtbar: Anzahl Quell-Buchungen + Zeitraum (z. B. "erkannt aus 12 Buchungen Jan–Dez 2025").
* `app/accounts/page.tsx` (Fix): echte Prisma-Abfrage statt Demo-Daten.

### 6. Fix der Import-Idempotenz

`app/import/actions.ts` wird auf Zeilen-Import mit Behandlung von `P2002` (Prisma Unique Constraint) umgestellt, wie in [ADR 0002](./0002-sqlite-import-strategy.md) beschrieben. Damit ist `createMany()` konsistent mit der dokumentierten Strategie ersetzt.

## Alternativen

* **Tabelle in Excel/Google Sheets führen**: Machbar für die reine statische Vorschau, aber kein lebender Abgleich mit echten Buchungen und doppelter Pflegeaufwand. Verworfen, weil genau dieser Abgleich der Mehrwert der App ist.
* **Vollautomatische Erkennung ohne manuelle Bestätigung**: Zu riskant bei dünner Datenbasis (jährliche Zahlungen fehlen) und bei atypischen Mustern (Retouren, ungewöhnliche Häufungen). Verworfen.
* **Rein manuelle Pflege ohne Auto-Erkennung**: Verlangt das Eintippen von ca. 40 Positionen und lässt die vorhandene Historie ungenutzt. Verworfen.

Der gewählte Hybrid (manuell + Auto-Vorschläge mit Bestätigung) minimiert beide Risiken und nutzt das existierende Datenfundament.

## Konsequenzen

### Vorteile

* Das ursprüngliche Ziel (Überblick über erwartete Abbuchungen) wird mit überschaubarem Aufwand erreicht
* Bestehender Code (Parser, Merchant-Normalisierung, Dedup-Fingerprint) wird weitergenutzt, nicht ersetzt
* Das neue Datenmodell ist Postgres-kompatibel und blockiert die geplante Migration nicht
* Auto-Erkennung wird mit wachsender Historie automatisch präziser, ohne Code-Änderung

### Nachteile

* Neue DB-Tabelle und Migration — minimal invasiv, aber nötig
* Auto-Erkennung ist heuristisch; Fehl-Vorschläge sind möglich, werden aber durch den Bestätigungs-Schritt abgefangen
* Jahreszahlungen bleiben für die erste Iteration manuell
* PDF-Import addiert eine Node-Abhängigkeit (`pdf-parse`)

### Aufwandsschätzung

Rund 1–2 Arbeitstage fokussierter Entwicklung, gegliedert nach Umsetzungsplan unten.

## Umsetzungsplan

Reihenfolge wichtig — jeder Schritt ist jeweils für sich abschließbar und testbar.

### Phase 1 – Altlasten fix (ca. 1 h)

1. `app/import/actions.ts` auf Zeilen-Import mit P2002-Handling umstellen
2. `app/accounts/page.tsx` auf echte Prisma-Abfrage umstellen
3. README und `PROJECT_STATUS.md` entsprechend anpassen

### Phase 2 – PDF-Import (ca. 2 h)

4. `pdf-parse` als Dependency aufnehmen
5. Hilfsfunktion `extractVolksbankPdfText(buffer)` in `lib/pdf.ts`
6. `components/import-workbench.tsx` + `app/import/actions.ts` um PDF-Upload-Typ ergänzen
7. Smoke-Test: Import aller 17 geschwärzten PDFs in eine lokale Test-DB, Sichtprüfung der erkannten Buchungen

### Phase 3 – Datenmodell (ca. 1 h)

8. Prisma-Migration für `RecurringPayment` + Enums
9. Minimal-Tests für Forecast-Berechnung pro `RecurrenceKind`

### Phase 4 – Forecast-Seite mit manueller Erfassung (ca. 2–3 h)

10. `app/forecast/page.tsx` (Liste, Gruppierung, Zeitraum-Toggle)
11. `app/forecast/neu/page.tsx` (Formular)
12. Berechnung + Persistierung von `nextExpectedDate`

Nach Phase 4 ist die App **ohne Auto-Erkennung bereits nutzbar**. Ab hier hat der Nutzer einen funktionierenden Überblick.

### Phase 5 – Auto-Erkennung (ca. 3–4 h)

13. `lib/recurring-detection.ts`: Gruppierung, Perioden-Erkennung, Konfidenz-Berechnung
14. Server Action "Erkennung ausführen"
15. `app/forecast/vorschlaege/page.tsx` mit Bestätigungs-Flow

### Phase 6 – Feinschliff (optional, bis 2 h)

16. Kleine Liquiditäts-Warnung auf dem Dashboard ("erwartete Abbuchungen der nächsten 7 Tage: XXX €")
17. Filter und Sortierung auf der Forecast-Seite
18. Empty-States und Loading-States

## Offene Fragen

1. **Kontoübergreifend oder pro Konto?** — Vorschlag: kontoübergreifend mit Filter-Option. Der Großteil der wiederkehrenden Zahlungen läuft typischerweise ohnehin über das Hauptkonto.
2. **Sichtbarkeit der Vorschlag-Quellen** — Vorschlag: ja, als kleiner Info-Text unter jedem auto-erkannten Eintrag ("erkannt aus 12 Buchungen Jan–Dez 2025"), damit Vertrauen entstehen kann.
3. **Umgang mit "wackligen" Vorschlägen (Konfidenz 30–50)** — Vorschlag: nicht speichern, aber in der Vorschläge-Seite unter "mögliche weitere Muster" als schwache Kandidaten anzeigen. Alternativ ganz weglassen, bis klar ist, ob sie helfen oder stören.
4. **Jahreszahlungen** — Sollen wir im Formular einen Hinweis einblenden, wenn der User gerade eine jährliche Zahlung anlegt, damit klar ist: "das findet Auto-Erkennung aus einem Jahr Daten nicht"?
5. **Zeitpunkt für Erkennungsläufe** — Manuell per Button? Automatisch nach jedem Import? Beides? Vorschlag: zunächst manuell, um Kontrolle beim Nutzer zu lassen.

## Nicht in diesem ADR, aber absehbar folgend

* ADR 0004 "Abgleich erwartet vs. tatsächlich": sobald eine Buchung eingeht, wird sie (per `merchantKey` + Datum + Betrag-Toleranz) gegen `RecurringPayment` gematcht, und die Vorschau aktualisiert sich. Benötigt zusätzlich ein Feld `RecurringPaymentMatch` oder vergleichbar.
* ADR 0005 "Budget pro Kategorie und Warnschwellen": baut auf dem Forecast auf.
