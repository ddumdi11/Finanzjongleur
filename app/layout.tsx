import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanzjongleur",
  description: "Private Finanzverwaltung mit Import- und Dedupe-Workflow"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <header className="header">
          <h1>Finanzjongleur</h1>
          <nav>
            <a href="/">Dashboard</a>
            <a href="/accounts">Konten</a>
            <a href="/import">Import</a>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
