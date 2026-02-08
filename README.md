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

## Arbeiten in Codex vs. lokal in VS Code
- **Codex-Umgebung:** Gut für schnelle Iterationen und erste Commits.
- **Lokal in VS Code:** Empfohlen für deinen Alltag (stabile npm-Zugriffe, direkte Kontrolle über Terminal, Browser-Tests).

### Empfohlener lokaler Start (VS Code)
1. Repository klonen:
   ```bash
   git clone https://github.com/ddumdi11/Finanzjongleur.git
   cd Finanzjongleur
   ```
2. Projekt in VS Code öffnen:
   ```bash
   code .
   ```
3. Terminal in VS Code öffnen (`Terminal` → `New Terminal`) und dann:
   ```bash
   cp .env.example .env
   npm install
   npm run prisma:generate
   npm run dev
   ```
4. App im Browser öffnen: `http://localhost:3000`

## Hinweise zu GitHub-Verbindung
Wenn Pushes aus einer Remote-Umgebung fehlschlagen (z. B. Proxy/403), arbeite lokal weiter und pushe von deinem Rechner:

```bash
git push -u origin work
```

## Nächster Schritt
- Prisma Client anbinden und Import-/Konfliktentscheidungen persistent speichern.
