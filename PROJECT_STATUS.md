# Finanzjongleur Projektstatus

Stand: 2026-04-21 (Phase 3 abgeschlossen)

## Kurzfassung

Finanzjongleur ist aktuell ein lokales Next.js-/Prisma-Projekt zur Verarbeitung von Banktransaktionen.
Der MVP-Kern fuer Konten, Import, Parsing, Persistenz und manuelle Kategorisierung ist vorhanden.
Die App ist bereits benutzbar, aber in mehreren Bereichen noch nicht konsolidiert.

## Aktueller Ist-Stand

### Stack

- Next.js App Router
- React + TypeScript
- Prisma ORM
- SQLite als lokale Datenbank

### Wichtige Einstiegspunkte

- `app/layout.tsx`: globales Layout und Navigation
- `app/page.tsx`: Dashboard mit Konten und letzten Buchungen
- `app/import/page.tsx`: Import-Seite
- `components/import-workbench.tsx`: Import-UI fuer Paste, Datei-Upload und Parser-Vorschau
- `app/import/actions.ts`: Server Action fuer Import in die Datenbank
- `app/transactions/page.tsx`: Buchungsliste und manuelle Kategorisierung
- `app/konten/neu/page.tsx`: Konto-Anlage
- `prisma/schema.prisma`: Datenmodell

## Bereits umgesetzte Funktionen

- Konten koennen in der Datenbank angelegt werden
- Dashboard liest echte Konten und Buchungen aus Prisma
- Import-Workbench unterstuetzt Copy/Paste und Datei-Upload
- Parser fuer einfaches CSV-aehnliches Format ist vorhanden
- Parser fuer Volksbank-Textimporte ist vorhanden
- Fingerprint fuer Deduplizierung ist implementiert
- Transaktionen werden gespeichert und im Dashboard angezeigt
- Kategorien koennen auf der Buchungsseite gesetzt werden
- Beim Kategorisieren koennen Merchant-Regeln aufgebaut bzw. verstaerkt werden

## Aktuelle Baustelle: Rettungsplan nach ADR 0003

Das urspruengliche Kernziel (Ueberblick ueber erwartete Abbuchungen)
ist noch nicht umgesetzt. Umsetzungsplan liegt in
[docs/adr/0003-forecast-und-wiederkehrende-zahlungen.md](docs/adr/0003-forecast-und-wiederkehrende-zahlungen.md)
vor und ist akzeptiert.

### Fortschritt

- [x] Phase 1: Altlasten-Fix (Import-Idempotenz, Accounts-Seite)
- [x] Phase 2: PDF-Import (pdf-parse v2, erweiterte Seiten-Bereinigung im Parser)
- [x] Phase 3: Datenmodell `RecurringPayment` + Forecast-Berechnung + Tests
- [x] Phase 4: Forecast-Seite mit manueller Erfassung
- [x] Phase 5: Auto-Erkennung aus Historie

## Aktueller Entwicklungsstand

Das Projekt liegt auf einem fortgeschrittenen MVP-Stand:

- Grundgeruest steht
- zentrale Datenfluesse sind vorhanden
- Import und Klassifizierung sind begonnen
- Forecast-Funktion fuer wiederkehrende Zahlungen ist noch nicht umgesetzt, aber geplant (ADR 0003)

## Nach Phase 1 abgeschlossen

- `app/import/actions.ts` nutzt jetzt zeilenweisen Import mit Behandlung von `P2002` (Prisma Unique Constraint) — konform zu [ADR 0002](docs/adr/0002-sqlite-import-strategy.md). Der Import ist damit fachlich idempotent.
- `app/accounts/page.tsx` liest echte Kontodaten aus Prisma, inkl. Buchungsanzahl und letztem Buchungsdatum je Konto.
- Die Import-Workbench zeigt bei Wiederimport jetzt auch die Anzahl uebersprungener Duplikate an.
- Deutsche Anzeige-Labels fuer `AccountType` zentral in `lib/account-labels.ts`.

## Nach Phase 2 abgeschlossen

- `pdf-parse` (v2) als Dependency ergaenzt; `lib/pdf.ts` mit `extractPdfText(Uint8Array)`.
- Server Action `extractPdfTextAction(FormData)` in `app/import/actions.ts`.
- Import-Workbench akzeptiert jetzt `.pdf` zusaetzlich zu `.txt`/`.csv`, fuehrt bei PDF eine serverseitige Extraktion aus und speist den Text anschliessend in den bestehenden Parser-Pfad ein.
- `parseVolksbankPaste` in `lib/parse.ts` erhaelt einen kleinen, aber wichtigen Fix: bei den Markern "Übertrag", "alter/neuer Kontostand" und der pdf-parse-Seitengrenze `-- N of M --` wird die laufende Buchung abgeschlossen. Dadurch landet der Header-/Footer-Text der naechsten Seite nicht mehr als Memo an der letzten Buchung vor dem Umbruch.
- Smoke-Test gegen den Januar-2026-Auszug (redigiertes PDF): 64 Buchungen erkannt, Summe -328,96 EUR = exakte Saldo-Differenz der Bank (1.098,18 − 1.427,14). Abweichung 0,00 EUR.

## Nach Phase 3 abgeschlossen

- Prisma-Schema erweitert: `RecurringPayment`-Modell, Enums `RecurrenceKind` (MONTHLY / QUARTERLY / YEARLY / CUSTOM) und `RecurringSource` (MANUAL / AUTO_DETECTED), Indexe auf `(accountId, isActive)` und `nextExpectedDate`, Rueckwaerts-Relation auf `Account.recurringPayments`.
- Reine Forecast-Berechnung in `lib/recurring.ts` (`computeNextExpectedDate`), bewusst ohne Prisma-Abhaengigkeit fuer saubere Testbarkeit. Kennt Monatsenden-Clipping (31. → 30./28./29. Feb) und wirft bei ungueltigen CUSTOM-Intervallen.
- Vitest als Test-Runner eingezogen. `npm test` laesst 13 Unit-Tests laufen, die alle Periodizitaeten + Edge-Cases (Schaltjahr, Tag-Clipping, Referenz vor Anker, Anker = Referenz) abdecken.
- Prisma-Client wurde noch nicht regeneriert und die Migration noch nicht gelegt — das muss lokal passieren (siehe "Offene Aktion" unten).

## Offene Aktion (lokal auszufuehren)

Nach `git pull` und `npm install` einmal:

```
npx prisma migrate dev --name add_recurring_payment
```

Damit werden:
- Migration `prisma/migrations/…_add_recurring_payment/migration.sql` angelegt
- SQLite-Schema aktualisiert (neue Tabelle + Enums als CHECK-Constraints)
- Prisma-Client regeneriert, damit die neuen Typen in TypeScript bekannt sind

Danach laufen die Tests mit `npm test`.

## Kategorien-System erweitert (Zwischenschritt, nicht Teil einer Phase)

- `TransactionCategory`-Enum von 8 auf 16 Werte erweitert. Neue Werte:
  `DISCRETIONARY` (Konsum), `DINING` (Gastronomie), `SUBSCRIPTIONS` (Abos),
  `COMMUNICATIONS` (Internet/Mobilfunk), `TRANSPORT` (Mobilitaet/OePNV),
  `HEALTH` (Gesundheit), `FEES` (Bankgebuehren), `GIFT` (Geschenke).
- Zentrale deutsche Anzeige-Labels in `lib/category-labels.ts` (analog zu
  `account-labels.ts`). Source of Truth fuer Reihenfolge und Bezeichnungen.
- `/transactions` zeigt die deutschen Labels im Dropdown.
- `lib/category-labels.test.ts` prueft Label-Coverage + Eindeutigkeit.
- **Lokal auszufuehren**: `npx prisma migrate dev --name extend_transaction_categories`
  erzeugt die Migration und regeneriert den Prisma-Client.

## Nach Phase 4 abgeschlossen

- Neue Seite `/forecast` mit drei Teilen:
  1. Zeitraum-Toggle 30/60/90 Tage und optionaler Konto-Filter (nur sichtbar, wenn >1 Konto existiert)
  2. Kalender-aehnliche Liste gruppiert nach Monat, inkl. Monats-Summe und Gesamt-Summe im Header
  3. Verwaltungstabelle "Alle aktiven wiederkehrenden Zahlungen" mit Deaktivieren- und Loeschen-Buttons
- Neue Seite `/forecast/neu`: Formular mit Feldern fuer Konto, Bezeichnung, Kategorie (optional), Betrag (mit Toleranz), Periodizitaet (MONTHLY/QUARTERLY/YEARLY/CUSTOM), Ausfuehrungstag, Startdatum, Merchant-Key (optional). Sichtbarer Hinweis zu jaehrlichen Zahlungen.
- `lib/recurring.ts` um `occurrencesInRange(payment, from, to)` erweitert — generiert alle Termine einer Wiederkehr im Zeitraum.
- `lib/periodicity-labels.ts` neu — deutsche Bezeichnungen fuer RecurrenceKind, plus `describePeriodicity` (z. B. "alle 14 Tage" fuer CUSTOM).
- `app/forecast/actions.ts` neu — Server Actions `createRecurringPaymentAction`, `toggleRecurringPaymentActiveAction`, `deleteRecurringPaymentAction`. Manuelle Anlagen werden sofort als `confirmedAt: now()` markiert, Quelle `MANUAL`.
- Navigationseintrag "Forecast" im Layout.
- Unit-Tests in `lib/recurring.test.ts` um 5 Faelle fuer `occurrencesInRange` ergaenzt (Monat/Quartal/Jahr, leer bei invertiertem Zeitraum, viele Auftritte bei CUSTOM).

## Nach Phase 5 abgeschlossen

- `lib/recurring-detection.ts` neu: reine Erkennungs-Logik aus Buchungs-Historie. Gruppierung ueber `normalizeMerchant` der ersten zwei Memo-Zeilen — trennt Amazon-Familie (Prime, Kindle, Audible, Music) sauber. Vorfilter (n >= 3, Spanne >= 60 Tage, einheitliche Vorzeichen) + Variationskoeffizienten-Reject (Perioden-CV > 0.33) + Konfidenz-Scoring nach ADR (Basis + 2x20 Boni).
- `lib/recurring-detection.test.ts` mit 10 Testfaellen: perfekt monatlich, quartalsweise, CUSTOM 14 Tage, Schwankende Betraege, Rauschen, gemischte Vorzeichen, zu kurz, zu wenig Buchungen, Label-Trennung Amazon-Familie, sourceNote-Format.
- Prisma-Schema: `RecurringPayment.sourceNote` String? ergaenzt fuer die Anzeige "12 Buchungen · Jan 2025 – Dez 2025".
- `runDetectionAction` in `app/forecast/actions.ts`: laeuft Erkennung auf allen Buchungen, schreibt Vorschlaege als `source=AUTO_DETECTED, confirmedAt=null`, ueberspringt Merchant-Keys mit bereits bestaetigter Wiederkehr, aktualisiert bestehende unbestaetigte Vorschlaege bei Re-Run.
- `confirmProposalAction` / `discardProposalAction`: Bestaetigen bzw. Loeschen eines Vorschlags.
- Neue Seite `/forecast/vorschlaege`: Liste der offenen Vorschlaege, sortiert nach Konfidenz. Pro Eintrag: Bezeichnung, Betrag, Periodizitaet, Konfidenz-%, Quellen-Info, Toleranz, Bestaetigen/Verwerfen.
- Forecast-Seite zeigt jetzt einen "Aus Historie erkennen"-Button und — falls offene Vorschlaege vorhanden sind — einen Link "X offene Vorschlaege pruefen".

## Offene Aktion (lokal auszufuehren)

Nach `git pull` und `npm install` einmal:

```
npx prisma migrate dev --name add_recurring_source_note
```

Das ergaenzt die neue Spalte `sourceNote` in der SQLite-DB und regeneriert den Prisma-Client.

## Detection-Fixes nach erstem Realbetrieb

Nach Import der vollen Historie und erstem Erkennungslauf fielen drei Luecken auf:

- Monatsnamen ("Februar", "Maerz" …) und kurze Zahlen (Tag.Monat.Jahr, Beträge) im Memo liessen den Merchant-Key jeden Monat variieren. ERGO, E.ON, Transdev, Audible, GEZ wurden deshalb nicht gruppiert.
- PayPal-Labels zeigten nur die erste Memo-Zeile und waren fuer alle PayPal-Abos identisch — nicht unterscheidbar.
- Telekom mit einer geplatzten SEPA-Lastschrift (AM04 Deckung ungenügend) hatte gemischte Vorzeichen, wurde komplett verworfen statt nur die Retoure zu ignorieren.

Fixes im Detail:

- `deriveMerchantKey` extrahiert jetzt aggressiver: reine Zahlen-Tokens raus, deutsche Monatsnamen raus (januar bis dezember inkl. Abkuerzungen, in post-Normalisierungsform "maerz" statt "märz").
- `deriveLabel` erkennt PayPal-Sammelbuchungen und liest den eigentlichen Haendler aus Zeile 2 ("PayPal: ardour.org", "PayPal: MyHeritage Ltd").
- Retouren-Toleranz: Wenn mindestens 80 % der Gruppe dasselbe Vorzeichen haben, ignoriert der Detector die Minderheit und analysiert nur die Mehrheit. Echte Mixed-Sign-Gruppen (50/50) werden weiterhin verworfen.
- 5 neue realistische Tests in `recurring-detection.test.ts` mit variierenden Memos (ERGO-Mandatsref-Drift, E.ON-Monatsnamen, Telekom-Retoure, PayPal-Label-Extraktion, PayPal-Haendler-Trennung).

Nebenher: `/transactions` zeigt unter der Transaktionszeile jetzt eine Memo-Vorschau (erste beide Memo-Zeilen, bis 140 Zeichen) — macht das Kategorisieren ohne separaten PDF-Blick möglich.

## Merchant-Auto-Kategorisierung verdrahtet

Der Import-Pfad war bisher stumm — `Transaction.merchantKey` wurde nie gesetzt,
MerchantRules wurden daher nie wirksam. Jede Kategorie-Zuweisung im UI war
reine Handarbeit ohne Lerneffekt fuer kuenftige Importe. Das haben wir
behoben:

- `lib/merchant.ts` neu: `deriveTransactionMerchantKey(memoRaw)` — nimmt
  die erste Memo-Zeile, normalisiert sie ueber den bestehenden
  `normalizeMerchant`. Filialadresse in Zeile 2 wird ignoriert, damit
  Ketten-Kategorisierungen chain-weit greifen (alle ALDIs = Lebensmittel
  etc.).
- `app/import/actions.ts`: Beim Import bekommt jede Transaktion ihren
  `merchantKey` und — falls eine passende `MerchantRule` existiert —
  bereits die passende Kategorie. Regeln werden einmal pro Import geladen
  und in-memory gematcht, keine N+1 Queries.
- Neue Server-Aktion `rebuildAndApplyRulesAction` auf der
  Buchungen-Seite: (1) setzt fehlende `merchantKey`-Werte nach, (2) baut
  Regeln aus bisher kategorisierten Buchungen (Mehrheits-Kategorie pro
  Merchant), (3) wendet die Regeln auf alle noch unkategorisierten
  Buchungen an.
- Button "Regeln aktualisieren & anwenden" auf `/transactions` mit
  Erklaerung. Idempotent — kann beliebig oft ausgefuehrt werden, jede
  neue Kategorisier-Runde fuettert die Regeln beim naechsten Klick.
- `lib/merchant.test.ts` neu: 6 Tests fuer `normalizeMerchant` und
  `deriveTransactionMerchantKey` (Schluessel stabil bei Whitespace und
  unterschiedlicher Filialadresse).

Wirkung fuer den Alltag: Nach einem Klick auf den Button sollte ein
grosser Teil der noch unkategorisierten Buchungen (vor allem Ketten wie
REWE, ALDI, LIDL, DM und wiederkehrende Lastschriften wie ERGO, E.ON,
Telekom, 1+1) automatisch den vom Nutzer schon vergebenen Kategorien
folgen. Beim naechsten Bank-Import (Volksbank) greifen dieselben Regeln
sofort.

## bunq-CSV-Import

Paralleler Pfad fuer den bunq-Export neben dem bestehenden Volksbank-Weg:

- `lib/parse-bunq.ts` neu: Semikolon-CSV-Parser mit RFC-4180-aehnlichem
  Quoting. Erkennung ueber Header-Match
  (`Date;Interest Date;Amount;Counterparty;Name;Description`). Setzt
  `merchantKey` direkt aus der Name-Spalte — bei bunq ist die Name-
  Spalte der echte Haendler (GOOGLE, OPENAI, bunq, SELF).
- `ParsedTransaction` hat ein neues optionales Feld `merchantKey`, das
  Parser bedienen koennen, die den Haendler bereits sauber in der
  Quelle haben. Der Import-Pfad verwendet `tx.merchantKey ??
  deriveTransactionMerchantKey(tx.memoRaw)`.
- `components/import-workbench.tsx` erkennt bunq-CSV anhand der
  Header-Zeile und zeigt im Parser-Status "bunq-CSV" an.
- `lib/parse-bunq.test.ts` neu: 13 Tests (CSV-Row-Parser inkl. Escape,
  Header-Erkennung, Buchungs-/Wertstellungs-Unterscheidung,
  Fremdwaehrungs-Info in memoRaw, Betrag-Vorzeichen, gleicher
  merchantKey bei gleichem Haendler).

Wirkung: Beim bunq-Import greifen die gelernten MerchantRules
automatisch fuer Haendler, die schon aus dem Volksbank-Import bekannt
sind (z. B. ALDI, REWE). bunq-spezifische Haendler (Google, OpenAI
etc.) bekommen beim ersten Import noch keine Kategorie — nach einmaliger
Handarbeit + "Regeln aktualisieren &amp; anwenden"-Klick aber schon.

## Label-Verbesserung in der Auto-Erkennung

Nach erstem bunq-Import sah man, dass Vorschlaege wie "invoice 38495247"
nicht aussagekraeftig waren — die monatliche bunq-Gebuehr trat unter
dem letzten Rechnungsnummer-Memo auf, nicht unter dem Haendler "bunq BV".

`deriveLabel` nutzt jetzt eine 3-Stufen-Logik:

1. PayPal-Spezialfall (Volksbank): Haendler aus Zeile 2 ziehen ("PayPal: ardour.org")
2. Wenn `description` keine generische Volksbank-Buchungsart ist
   (Basislastschrift, Kartenzahlung girocard, Ueberweisungsauftrag etc.),
   nutze `description` direkt — das ist bei bunq der saubere Haendler-Name
3. Sonst falle zur ersten Memo-Zeile zurueck (bisheriges Volksbank-Verhalten)

Wirkung: bunq-Vorschlaege heissen jetzt "bunq BV" statt "invoice 38495247",
"CLAUDE.AI SUBSCRIPTION" statt einer Memo-Zeile mit Land/Waehrung,
"OPENAI *CHATGPT SUBSCR" usw. Volksbank-Vorschlaege sind unveraendert.

## PayPal-CSV-Import

Dritter Parser neben Volksbank-PDF/Paste und bunq-CSV:

- `lib/parse-paypal.ts` neu: Komma-CSV-Parser fuer den deutschen
  PayPal-Export. Erkennung ueber Header-Match (`Datum`, `Brutto`,
  `Transaktionscode`, `Beschreibung`). Reutilisiert den CSV-Row-Parser
  aus `parse-bunq.ts`.
- **Paar-Filter**: PayPal schreibt fuer jede SEPA-gedeckte Zahlung zwei
  Zeilen (Ausgabe + Bankgutschrift-Gegenbuchung). Wir importieren nur
  die echte Zahlung und ueberspringen die internen Typen
  `Bankgutschrift auf PayPal-Konto` und `Allgemeine Waehrungsumrechnung`.
- Deutsches Datum (DD.MM.YYYY) wird ins ISO-Format konvertiert.
- `description` = Name-Feld (echter Haendler), bei fehlendem Name
  (z. B. Gebuehren) Fallback auf `Beschreibung`.
- `memoRaw` sammelt Beschreibung + E-Mail des Senders + Rechnungsnummer
  + Transaktionscode als mehrzeiligen Kontext.
- `merchantKey` wird direkt aus Name bzw. Beschreibung abgeleitet.
- `lib/parse-paypal.test.ts` neu: 11 Tests (Header-Erkennung,
  Paar-Filter, Stuetzbuchungs-Filter, Datum-Konvertierung, memoRaw-
  Zusammenstellung, Doppel-Vermeidung bei Gebuehren).
- `components/import-workbench.tsx` erkennt PayPal-CSV automatisch und
  zeigt "PayPal-CSV" als Parser-Status.

Vorgehen fuer den Nutzer: Ein eigenes PayPal-Konto anlegen
(`/konten/neu` → Girokonto → Name "PayPal"), dann die PayPal-CSV auf
der Import-Seite reinziehen. Die bestehenden MerchantRules greifen
automatisch fuer Merchants, die sich mit Volksbank-/bunq-Buchungen
ueberschneiden; PayPal-spezifische Merchants (Udemy, eToro, Arche etc.)
werden nach einmaliger Kategorisierung + "Regeln aktualisieren &
anwenden"-Klick kuenftig automatisch zugeordnet.

## Bekannte Eigenart (verbleibt)

Der Volksbank-Parser setzt `description` auf die Buchungsart ("Basislastschrift", "Kartenzahlung girocard", "Überweisungsauftrag"), nicht auf den echten Haendler. Der Haendler steht in der ersten Memo-Zeile. Die Auto-Erkennung nutzt daher die ersten zwei Memo-Zeilen als Gruppierungs-Schluessel — die Schema-Semantik bleibt stabil. Fuer Phase 6+ waere ein optionales Wiring der Merchant-Normalisierung in den Import-Pfad (und Bulk-Apply bestehender MerchantRule) ein sinnvoller naechster Schritt, um die manuelle Kategorisierung zu skalieren.

## Backlog

### Berichtsexport / Weitergabe der Auswertung

**Status: umgesetzt (Phase B abgeschlossen).** Die Berichte-Seite `/berichte`
ist exportierbar, damit Monatsauswertungen außerhalb der App weiterverwendet
werden können. Details siehe Abschnitt „Berichtsexport Phase B abgeschlossen"
unten. Der folgende Backlog-Kontext bleibt als Begründung der Formatwahl stehen.

Priorität der Exportformate:

1. **HTML-Export** – bevorzugt, weil Layout, Tabellen und menschenlesbare Struktur erhalten bleiben.
2. **Markdown-Export** – nützlich für Z-System / Notizen / Übergaben.
3. **CSV-Export** – nützlich für Tabellenkalkulation und Weiterverarbeitung.
4. **PDF** – optional; möglichst zunächst über druckfreundliches HTML / Browser-Druck statt eigener PDF-Library.

Möglicher technischer Ansatz:
- Route Handler z. B. `/berichte/export?month=YYYY-MM&account=...&format=html|md|csv`
- PDF zunächst über Print-CSS / Browser „Drucken als PDF“
- keine neue Dependency, solange HTML/Markdown/CSV ausreichen

#### Abgesegneter Implementierungsplan (Phase B)

Leitgedanke: die Berichtsberechnung aus `app/berichte/page.tsx` herausziehen,
damit Seite und Export dieselbe Prisma-Aggregation nutzen und nicht
auseinanderlaufen. Keine neue Dependency; PDF über Browser-Druck.

1. **Datenaufbau extrahieren** (`lib/report-data.ts`): `buildMonthlyReport({ month, account })`
   kapselt die `groupBy`/`_sum`/`_count`-Logik und liefert ein flaches,
   serialisierbares Objekt (Monatslabel, Währung, `incomeRows`, `expenseRows`,
   Saldo, Ein-/Ausgabensummen, `uncategorized {count,sum}`, Vergleichsblock
   aktuell/Vormonat/Delta, Kontoname). Decimal→Number-Wandlung einmalig hier;
   Summierung bleibt in der DB. Die Page wird darauf umgebaut (reines Refactoring).
2. **Reine Renderer** (`lib/report-format.ts`): `renderReportHtml` (eigenständiges
   HTML mit Inline-CSS, druckfreundlich für PDF), `renderReportMarkdown`
   (Markdown-Tabellen), `renderReportCsv` (flache Zeilen, siehe CSV-Entscheidung unten).
3. **Route Handler** (`app/berichte/export/route.ts`): `GET` liest `month`/`account`/`format`,
   validiert `format`, ruft `buildMonthlyReport` + passenden Renderer,
   liefert `Response` mit `Content-Type` und `Content-Disposition: attachment; filename="finanzbericht-YYYY-MM.<ext>"`.
4. **Verlinkung** auf `/berichte`: Zeile „Export: HTML · Markdown · CSV“
   mit aktuellem `month`+`account`.
5. **Tests** (`lib/report-format.test.ts`): die puren Renderer gegen ein
   `MonthlyReport`-Fixture prüfen (HTML enthält Kategoriezeilen, MD-Tabellenstruktur,
   CSV-Escaping ohne BOM) — ohne DB, passend zum Vitest-Setup.

#### Berichtsexport Phase B abgeschlossen

Alle fünf Schritte des Plans sind umgesetzt:

- [x] **Schritt 1** — `lib/report-data.ts` liefert `buildMonthlyReport(...)` und den Typ `MonthlyReport`; die Seite `/berichte` konsumiert das (Commits #8/#9).
- [x] **Schritt 2** — `lib/report-format.ts` mit den reinen Renderern
  `renderReportHtml(report)`, `renderReportMarkdown(report)`, `renderReportCsv(report)`.
  Keine DB/Prisma, nur Darstellung; Kategorielabels aus `lib/category-labels.ts`.
  Eigenübertragungen werden separat ausgewiesen, nicht in die Hauptsummen gerechnet.
- [x] **Schritt 3** — Route Handler `app/berichte/export/route.ts` (`GET`,
  `dynamic = "force-dynamic"`): liest `month`/`account`/`format`, wählt den Renderer
  und liefert einen Attachment-Download. Formate + Aliase: `html`/`htm`,
  `markdown`/`md`, `csv`; Default `html`; ungültiges Format → 400; Fehler in
  `buildMonthlyReport` → 500 (ohne Details/Stacktrace). Content-Types:
  `text/html` / `text/markdown` / `text/csv`, je `charset=utf-8`. Dateiname
  `finanzbericht-<monthKey>.<ext>`.
- [x] **Schritt 4** — Exportlinks auf `/berichte` (schlichte Zeile „Export:
  HTML · Markdown · CSV“, als `<a>`-Download-Links unter der Monats-/Konto-Navigation).
  Übernehmen den gewählten Monat und — falls gesetzt — den Kontofilter;
  Markdown nutzt `format=markdown`.
- [x] **Schritt 5** — `lib/report-format.test.ts` mit `MonthlyReport`-Fixture.

**CSV-Format (Projektentscheidung):** neutraler CSV-Standard — Komma als
Separator, Punkt als Dezimaltrenner, **kein UTF-8-BOM**, Beträge mit zwei
Nachkommastellen, RFC-4180-Quoting. Bewusst abweichend von der ursprünglichen
Plan-Empfehlung „deutsches Excel (`;`-Trenner, Komma-Dezimal, BOM)“ — begründet
mit besserer maschineller Weiterverarbeitbarkeit.

Prüfstand: `npm test -- report` → 21 passed; `npx tsc --noEmit` → sauber.

Offen bleibt allenfalls PDF-Export (weiterhin nur über Browser-Druck der
HTML-Ausgabe, keine eigene Umsetzung geplant).