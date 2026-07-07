# Übergabenotiz: Fable-Supervisor-Review Finanzjongleur — 07.07.2026

**Reviewer:** Fable 5 (Strategie/Revision, kein Code geändert)
**Gesichtet:** PROJECT_STATUS.md, README, prisma/schema.prisma, app/-Struktur, lib/-Module inkl. Tests, ADRs, Migrationsstand, Git-Log
**Anlass:** Wunsch nach individuellen Statistik-Reports + allgemeiner Review

---

## 1. Gesamturteil

Das Projekt ist für ein MVP ungewöhnlich sauber aufgestellt. Besonders stark: die konsequente Trennung von reiner Logik (`lib/` ohne Prisma-Abhängigkeit, gut getestet — recurring, detection, parser, merchant) und Datenzugriff; die ADR-Disziplin; der idempotente Import mit Fingerprint; die lernende Merchant-Rule-Schleife; drei Parser (Volksbank-PDF/Paste, bunq, PayPal) mit automatischer Format-Erkennung. Der Detection-Teil (CV-Reject, Retouren-Toleranz, PayPal-Label-Extraktion) zeigt echte Realbetriebs-Härtung. Local-first mit SQLite ist für den Zweck genau richtig.

**Kurz: Das Fundament trägt die gewünschten Statistik-Reports problemlos — es fehlt schlicht die Aggregationsschicht, sonst nichts.**

## 2. Befunde (nach Gewicht)

### B1 — Dashboard lädt die komplette Buchungshistorie (mittel, wächst mit der Zeit)

`app/page.tsx` macht `prisma.transaction.findMany()` ohne `where`/`take` und filtert dann in JS pro Konto auf 10 Einträge. Bei voller Historie (mehrere Konten × Jahre) wird das spürbar langsam und speicherhungrig. Fix ist klein: pro Konto `take: 10` mit `where: { accountId }` — oder eine einzige Query mit `orderBy` + `take` und Gruppierung, sobald die Berichte-Seite ohnehin Aggregationen einführt.

### B2 — Doku-Drift in PROJECT_STATUS.md (klein, aber verwirrend)

Kopfzeile sagt „Stand: 2026-04-21 (Phase 3 abgeschlossen)", der Inhalt beschreibt aber Phase 4, 5, Detection-Fixes, bunq- und PayPal-Import; Migrationen reichen bis 22.05. Außerdem widerspricht sich das Dokument selbst („Forecast … noch nicht umgesetzt, aber geplant" vs. „Phase 4/5 abgeschlossen"). Empfehlung: Kopfzeile aktualisieren und die überholten Absätze aus der Frühphase streichen oder als „Historie" markieren — die Datei ist eure zentrale Wiedereinstiegsstelle, sie sollte widerspruchsfrei sein.

### B3 — Git-Stand hinkt dem Arbeitsstand hinterher (prüfen)

`git log` zeigt 5 Commits bis „#5 Import rules + dedup", der Code enthält aber sichtbar spätere Arbeit (PayPal-Parser, Detection-Fixes, Lebenszyklus-Felder). Entweder liegen Commits nur lokal/unerfasst oder auf einem anderen Branch. Bei einem Finanzdaten-Projekt wäre ein sauberer Commit-Rhythmus (mindestens je Phase) auch Backup-Strategie. → Kurz prüfen: `git status` / `git stash list`.

### B4 — Zwei „Offene Aktionen" (Migrationen) möglicherweise erledigt, aber nicht abgehakt

PROJECT_STATUS nennt zweimal „lokal auszuführen: prisma migrate dev …" — die Migrationsliste zeigt Migrationen bis 22.05. (ended_fields, dismissed_at). Vermutlich erledigt → abhaken, sonst nachholen.

### B5 — Decimal-Handhabung bei künftigen Aggregationen (Hinweis, kein Fehler)

`amount` ist Prisma-`Decimal` (gut!). In den Pages wird für die Anzeige mit `Number(...)` konvertiert — für Einzelbeträge unkritisch. Bei den kommenden Berichts-Summen: Entweder Prisma-`groupBy` mit `_sum` direkt verwenden (aggregiert in der DB) oder bewusst in Cents/Integer summieren. Nicht: viele `Number()`-Floats aufaddieren.

## 3. Statistik-Reports: schlankster Weg (Vorschlag als ADR 0004)

Kern-Idee: **eine neue Server-Component-Seite `/berichte`, reine Prisma-`groupBy`-Aggregation, null neue Dependencies.** Die bestehende Kategorisierung + MerchantRules liefern die Dimension, RecurringPayment liefert die Fixkosten-Sicht.

**Phase A — Monatsbericht (≈ halber Tag):**

- Monats-/Konto-Auswahl (wie Forecast-Seite: Toggle + optionaler Filter)
- `groupBy(['category'], _sum.amount, where: bookingDate im Monat)` → Tabelle Kategorie × Summe, getrennt Einnahmen/Ausgaben, Saldo
- Zeile „Unkategorisiert (n Buchungen)" mit Link auf `/transactions` — treibt nebenbei die Kategorisier-Schleife an
- Vergleichsspalte Vormonat (zweites groupBy, Delta)

**Phase B — Struktur-Sichten (≈ 1 Tag):**

- Jahresmatrix: 12 Monate × Kategorien (eine groupBy-Query über das Jahr, Pivot in JS)
- Top-10-Merchants nach Summe (`groupBy(['merchantKey'])`)
- **Fix vs. variabel:** Buchungen, deren `merchantKey` zu einer aktiven `RecurringPayment` passt, als „Fixkosten" ausweisen — daraus fällt die Kennzahl „monatliche Grundlast" heraus

**Phase C — Export (≈ halber Tag):**

- Route Handler `/berichte/export?monat=…&format=csv|md` — CSV für Tabellenkalkulation, **Markdown für das Z-System** (Bericht direkt als Z-taugliche Notiz ablegen)
- PDF vorerst über Drucken-Dialog des Browsers (print-CSS), keine Library

**Bewusst NICHT in v1:** Charts (erst wenn Tabellen sich bewähren; dann Recharts), konfigurierbare Report-Templates, Budgets/Soll-Ist. Erst nutzen, dann ausbauen — Etappen, nicht Ideale. ;-)

## 4. Projektübergreifender Bonus (Hinweis an die Projektsteuerung)

Die Phase-B-Kennzahl „monatliche Grundlast" (Fixkosten aus RecurringPayment + kategorisierten Buchungen) ist exakt die Zahl, die im **IT-Dienstleistungs-Projekt** für den Businessplan-Finanzteil (Lebensunterhalt/Kapitalbedarf beim Gründungszuschuss) gebraucht wird — Finanzteil-Häppchen 1 „Fixkosten" könnte also direkt aus einem Finanzjongleur-Bericht gespeist werden, statt manuell geschätzt. Empfehlung: Phase A+B vor dem Finanzteil-Block umsetzen, dann rechnet der Businessplan mit echten Zahlen.

## 5. Empfohlene Reihenfolge

1. B3 prüfen (git status — 5 Minuten, ggf. committen)
2. B2/B4 PROJECT_STATUS bereinigen (15 Minuten)
3. Phase A `/berichte` bauen (halber Tag; B1-Fix fällt dabei mit ab)
4. Phase B (Fixkosten-Sicht) → Zahl an IT-Dienstleistungs-Projekt liefern
5. Phase C Export (Markdown → Z-System)

*Ende der Übergabenotiz — Umsetzung bitte im Finanzjongleur-Projekt (Opus/Codex), nicht durch den Reviewer. ;-)*
