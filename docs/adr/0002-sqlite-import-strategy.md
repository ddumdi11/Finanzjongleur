# ADR 0002 – Import-Strategie mit SQLite

## Status

Accepted

## Kontext

Die Anwendung importiert Banktransaktionen aus Kontoauszügen.
Um doppelte Buchungen zu verhindern, wird ein eindeutiger Fingerprint pro Transaktion berechnet.

Es existiert eine Unique-Constraint:
(accountId, fingerprint)

Mit SQLite schlägt `prisma.transaction.createMany()` bei Duplikaten vollständig fehl, da `skipDuplicates` in Prisma für SQLite nicht unterstützt wird.

## Entscheidung

Der Import erfolgt aktuell zeilenweise:

* Jede Transaktion wird einzeln mit `prisma.transaction.create()` gespeichert
* Unique-Constraint-Fehler (`P2002`) werden als Duplikate interpretiert und ignoriert
* Der Import bleibt damit idempotent (mehrfaches Importieren desselben Kontoauszugs erzeugt keine Duplikate)

## Konsequenzen

### Vorteile

* Robuster Import
* Wiederholbare Kontoauszug-Imports
* Keine Benutzerfehler bei erneutem Import

### Nachteile

* Langsamer als Batch-Insert
* Nicht optimal für große Datenmengen

## Zukunft / Migration

Bei späterem Wechsel auf PostgreSQL:

* `createMany({ skipDuplicates: true })` soll wieder aktiviert werden
* Import kann dann wieder batchweise erfolgen
* Fingerprint-Logik bleibt unverändert

Diese Entscheidung ist bewusst ein MVP-Tradeoff zugunsten von Stabilität und einfacher Entwicklung.
