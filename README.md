# Finanzjongleur

Finanzjongleur ist eine lokale Desktop-Webanwendung zur automatischen Verarbeitung von Bankkontoauszügen.

Ziel des Projekts ist es, Banktransaktionen aus Text-Exports (z. B. Volksbank Online-Banking) direkt zu importieren, strukturiert zu speichern und langfristig automatisch zu kategorisieren.

Das Projekt wird bewusst als **lokal-first Anwendung** entwickelt:
Alle Finanzdaten bleiben ausschließlich auf dem eigenen Rechner gespeichert.

---

## Kernfunktionen (aktueller Stand)

* Import von Kontoauszügen per Copy & Paste
* Automatische Erkennung einzelner Buchungen
* Zuordnung zu Konten
* Duplikatserkennung (idempotenter Import)
* Speicherung in einer relationalen Datenbank
* Anzeige der letzten Buchungen im Dashboard

---

## Architektur

Die Anwendung basiert auf einer modernen Full-Stack-Architektur:

* Next.js (Server Components & Server Actions)
* Prisma ORM
* SQLite Datenbank (lokal)
* React UI

Der Import ist bewusst fehlertolerant umgesetzt:
Mehrfaches Importieren desselben Kontoauszugs erzeugt keine doppelten Buchungen.

---

## Warum dieses Projekt existiert

Viele Finanz-Tools setzen Cloud-Anbindungen oder Banking-APIs voraus.
Finanzjongleur verfolgt einen anderen Ansatz:

**Die Daten gehören dem Nutzer.**

Statt Bankzugriff werden vorhandene Kontoauszüge verarbeitet.
Damit funktioniert das Tool mit nahezu jeder Bank — ohne Zugangsdaten oder Schnittstellen.

---

## Roadmap

* Automatische Kategorisierung von Buchungen
* Such- und Filterfunktionen
* Monatsauswertungen
* CSV-Export
* Optional: PostgreSQL-Mehrgerätebetrieb

---

## Entwicklungsstatus

Aktiv in Entwicklung (seit 2026)

Dieses Repository dokumentiert bewusst den gesamten Entwicklungsprozess — einschließlich Architekturentscheidungen.
