# Finanzjongleur

Erstes technisches Grundgerüst für die private Finanzverwaltungs-App.

## Enthalten
- Next.js + TypeScript App Router
- Seiten: Dashboard, Konten, Import
- Import-Workbench mit Textfeld + Drag-and-Drop (TXT/CSV)
- Parser-V1 (`YYYY-MM-DD;Betrag;Gegenkonto;Verwendungszweck`)
- Dedupe-Dialog mit Entscheidungen: Überschreiben / Verwerfen / Beide behalten
- Prisma-Schema mit SQLite als Start-Datenbank

## Start
1. `cp .env.example .env`
2. `npm install`
3. `npm run prisma:generate`
4. `npm run dev`

## Nächster Schritt
- Prisma Client anbinden und Import-/Konfliktentscheidungen persistent speichern.
