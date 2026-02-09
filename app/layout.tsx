import type { Metadata } from "next";
import Link from "next/link";
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
            <Link href="/">Dashboard</Link>
            <Link href="/accounts">Konten</Link>
            <Link href="/import">Import</Link>
            <Link href="/transactions">Buchungen</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
