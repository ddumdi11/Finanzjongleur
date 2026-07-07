/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse laedt pdfjs-dist inkl. eines Web-Worker-Scripts zur Laufzeit
  // nach. Turbopack bundlet die .worker.mjs-Datei im Default-Modus nicht an
  // die von pdfjs-dist erwartete Stelle, wodurch "Setting up fake worker
  // failed" auftritt. Als serverExternalPackages markiert laesst Next.js
  // beide Pakete zur Laufzeit direkt aus node_modules laden — dort liegt
  // die Worker-Datei korrekt neben der Hauptdatei.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
