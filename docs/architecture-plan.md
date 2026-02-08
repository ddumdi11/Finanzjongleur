# Finanzverwaltung App – Architektur- und MVP-Plan (Schritt 1)

## Zielbild
Eine privat nutzbare Finanzverwaltungs-App mit schneller prototypischer Nutzbarkeit und klarer Ausrichtung auf Produktreife.

## Funktionsumfang (MVP + Erweiterungen)

### 1) Kontoauszüge einlesen
- **MVP:** CSV-Import (Bankexporte), manueller Textimport.
- **Erweiterung:** PDF-Import (OCR/Parser), bank-spezifische Vorlagen.

### 2) Verschiedene Konten verwalten
- Kontotypen: Girokonto, Kreditkarte, Tagesgeld, Bargeld.
- Transfers zwischen eigenen Konten als eigener Buchungstyp.

### 3) Wiederkehrende Ausgaben verwalten
- Regeln mit Intervallen (monatlich, quartalsweise, jährlich).
- Vorschau auf kommende Belastungen.

### 4) Ein-/Ausgaben planen (Monat, Quartal, Jahr)
- Budget pro Kategorie.
- Ist-/Plan-Vergleich und Forecast bis Periodenende.

### 5) Erinnerungen & Warnungen
- Schwellwerte: z. B. „80 % Budget erreicht“.
- Prognosewarnung bei voraussichtlicher Überschreitung.

### 6) Einfaches Handling
- Fokus auf wenige Kernflows:
  1. Daten importieren
  2. Unklare Buchungen prüfen
  3. Überblick/Planung prüfen

### 7) KI-Unterstützung via OpenRouter
- Modellauswahl pro Use Case (Kategorisierung, Zusammenfassungen, Hinweise).
- Protokollierung von Modell, Prompt-Version und Confidence.

## Zusätzliche Wünsche aus dem Gespräch

### A) Text-Dropzone + Copy/Paste
- UI-Komponente: großes Eingabefeld mit Drag-and-Drop für `.txt` und Paste.
- Parsing-Workflow:
  1. Rohtext erfassen
  2. Normalisieren (Zeilenumbrüche, Datums-/Betragsformate)
  3. In internes Transaktionsschema mappen
  4. Unsichere Treffer als „Review erforderlich“ markieren
- Ausgabe immer strukturiert im gleichen Zielformat wie CSV-Import.

### B) Rückfragefenster bei bereits vorhandenen Daten
- Dedupe-Logik über Fingerprint, z. B.: Datum + Betrag + Gegenkonto + Verwendungszweck (normalisiert).
- Bei Konflikten ein Entscheidungsdialog:
  - **Überschreiben** (neu ersetzt alt)
  - **Behalten** (neu verwerfen)
  - **Beide behalten** (wenn gewünscht, mit Markierung)
- Optionaler Batch-Modus: „Regel für alle Konflikte in diesem Import anwenden“.

## Technologie-Empfehlung

## Sprache/Stack
- **Empfehlung:** TypeScript-first für App-Entwicklung + Option auf Python-Worker später.
- Warum:
  - Schnelle UI-Iteration (Web-App)
  - Einheitlicher Stack in der frühen Phase
  - Späterer Ausbau für komplexes Parsing/ML in Python möglich, ohne Re-Write

## Datenbank: SQLite vs PostgreSQL

### Kurzfazit
- **Für schnellen Prototypen:** SQLite ist absolut ausreichend.
- **Für produktreife, dauerhafte Nutzung:** PostgreSQL ist die bessere Zielplattform.

### Empfohlene Strategie (beides kombinieren)
1. **Phase 1 (sofort):** SQLite lokal für raschen Start.
2. **Phase 2 (früh einplanen):** ORM + Migrationen so aufsetzen, dass Wechsel nach PostgreSQL trivial bleibt.
3. **Phase 3 (Produktreife):** PostgreSQL als Standardbetrieb.

### Begründung
- PostgreSQL bietet robustere Parallelität, bessere Integrität/Skalierung, starke Query-Funktionen.
- SQLite reduziert Setup-Hürde für frühe Tests und Demo-Nutzung.

## Vorschlag Tech-Stack (konkret)
- **Frontend:** Next.js + TypeScript + UI-Komponentenbibliothek
- **Backend:** Next.js API Routes oder NestJS
- **ORM:** Prisma (SQLite + PostgreSQL kompatibel)
- **DB initial:** SQLite
- **DB target:** PostgreSQL
- **Jobs/Reminder:** Background-Worker (Cron/Queue)
- **KI:** OpenRouter-Adapter mit austauschbaren Modellen pro Task

## Erste Backlog-Slices (empfohlen)
1. Grundgerüst (Auth optional), Konten, Kategorien, manuelle Buchungen
2. CSV-Import + Normalisierung + Dedupe-V1
3. Text-Dropzone + Parser-V1 + Review-Ansicht
4. Wiederkehrende Buchungen + Budget Monat
5. Forecast Quartal/Jahr + Warnungen
6. OpenRouter-gestützte Kategorisierung + Zusammenfassung

## Entscheidungslogik für „schnell starten, produktreif enden“
- Ja zu **SQLite jetzt**, wenn:
  - du sofort mit echten Daten testen willst,
  - der Nutzerkreis klein ist,
  - lokale/offline-nahe Nutzung am Anfang reicht.
- Ja zu **PostgreSQL als Ziel**, wenn:
  - Zuverlässigkeit und Datenkonsistenz langfristig hoch priorisiert sind,
  - mehrere Clients/Sessions parallel arbeiten,
  - Produktreife ausdrücklich angestrebt wird.

## Konkrete Empfehlung
- Wir starten direkt mit einer Struktur, die **PostgreSQL-ready** ist, betreiben die ersten Iterationen aber auf **SQLite**.
- Dadurch bekommst du den gewünschten schnellen Prototypen **ohne** Architektur-Sackgasse.

## Nächste Schritte (praktisch, für den Einstieg mit Codex)
1. **Repository klären:** Dieses Repo enthält aktuell nur das Planungsdokument. Als nächstes legen wir das App-Grundgerüst an (z. B. Next.js + Prisma + SQLite).
2. **MVP-Backlog in Tickets aufteilen:** Die Slices aus diesem Dokument als einzelne Aufgaben erfassen (Import, Dedupe-Dialog, Budget, Alerts, KI).
3. **Vertikalen ersten Flow bauen:**
   - Konto anlegen
   - CSV oder Text einfügen/importieren
   - Buchungen sehen und bei Duplikaten entscheiden
4. **Frühe Tests einführen:** Parser-Unit-Tests + 1–2 End-to-End-Tests für Import und Konfliktentscheidung.
5. **Danach Iterationen:** wiederkehrende Buchungen, Forecast, Warnungen, OpenRouter-Funktionen.

## Wo laufen Entwicklung und Tests?
- **Hier in der Entwicklungsumgebung:**
  - Ja, du kannst Entwicklung, Build und Tests direkt hier ausführen.
  - Das ist ideal für schnelle Iterationen mit Codex.
- **Lokal auf deinem Rechner:**
  - Nur nötig, wenn du selbst lokal entwickeln oder manuell testen möchtest.
  - Dann klonst du das Repo von GitHub und startest die App lokal.
- **Empfehlung für dich als Einstieg:**
  - Zuerst hier mit Codex umsetzen und testen.
  - Optional später lokal spiegeln, wenn du unabhängig weiterarbeiten willst.

## Vorschlag für den direkten nächsten Umsetzungs-Task
- Ich kann als nächsten Schritt sofort das Grundgerüst erstellen:
  - Next.js (TypeScript)
  - Prisma-Schema mit SQLite
  - Seiten für Konten + Import-Ansicht mit Text-Dropzone
  - erste Dedupe-Entscheidungslogik als UI-Dialog
