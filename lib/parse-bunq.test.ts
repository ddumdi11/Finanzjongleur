import { describe, it, expect } from "vitest";
import {
  looksLikeBunqCsv,
  parseBunqCsv,
  parseCsvRow,
} from "./parse-bunq";

const SAMPLE_CSV = [
  `"Date";"Interest Date";"Amount";"Counterparty";"Name";"Description"`,
  `"2024-07-02";"2024-07-02";"0,05";"NL13BUNQ2094122549";"bunq";"bunq Payday 2024-07-02 EUR"`,
  `"2024-07-08";"2024-07-08";"50,00";"DE__VOBA_SELF";"SELF";"OpenAI 2. Versuch"`,
  `"2024-07-08";"2024-08-01";"-1,00";;"GOOGLE *CHROME TEMP";"GOOGLE *CHROME TEMP CC@GOOGLE.COM, US"`,
  `"2024-07-08";"2024-08-01";"1,00";;"GOOGLE *CHROME TEMP";"Refund: GOOGLE *CHROME TEMP CC@GOOGLE.COM, US"`,
  `"2024-07-08";"2024-08-01";"-22,13";;"OPENAI *CHATGPT SUBSCR";"OPENAI *CHATGPT SUBSCR +14158799686, US 23.80 USD, 1 USD = 0.92983 EUR"`,
  `"2024-07-09";"2024-07-09";"0,05";"NL13BUNQ2094122549";"bunq";"bunq Payday 2024-07-09 EUR"`,
].join("\n");

describe("parseCsvRow", () => {
  it("parst Semikolon-getrennte gequotete Felder", () => {
    const row = parseCsvRow(`"a";"b";"c"`);
    expect(row).toEqual(["a", "b", "c"]);
  });

  it("behandelt leere Felder zwischen Semikolons", () => {
    const row = parseCsvRow(`"a";;"c"`);
    expect(row).toEqual(["a", "", "c"]);
  });

  it("dekodiert doppelte Anfuehrungszeichen als ein Zeichen", () => {
    const row = parseCsvRow(`"a""b";"c"`);
    expect(row).toEqual([`a"b`, "c"]);
  });

  it("parst ungequotete Werte gemischt mit gequoteten", () => {
    const row = parseCsvRow(`plain;"gequoted";123`);
    expect(row).toEqual(["plain", "gequoted", "123"]);
  });
});

// Neues 7-Spalten-Format: zusaetzliche "Account"-Spalte zwischen Amount und
// Counterparty. Enthaelt eine leere Counterparty und eine Description mit
// Kommata (Fremdwaehrungs-Info), um das CSV-Splitting zu pruefen.
const SAMPLE_CSV_V2 = [
  `"Date";"Interest Date";"Amount";"Account";"Counterparty";"Name";"Description"`,
  `"2026-03-01";"2026-03-01";"108,00";"DE********************";"DE********************";"Thorsten Diederichs";"Anthropic"`,
  `"2026-03-01";"2026-04-01";"-107,10";"DE********************";"";"CLAUDE.AI SUBSCRIPTION";"CLAUDE.AI SUBSCRIPTION SAN FRANCISCO, US"`,
  `"2026-03-06";"2026-04-01";"-11,30";"DE********************";"";"VOICY BY PISHI LLC";"VOICY BY PISHI LLC ABU DHABI, AE 12.99 USD, 1 USD = 0.86990 EUR"`,
].join("\n");

describe("looksLikeBunqCsv", () => {
  it("erkennt den bunq-Header in der ersten Zeile", () => {
    expect(looksLikeBunqCsv(SAMPLE_CSV)).toBe(true);
  });

  it("erkennt auch das neue 7-Spalten-Format mit Account-Spalte", () => {
    expect(looksLikeBunqCsv(SAMPLE_CSV_V2)).toBe(true);
  });

  it("lehnt Volksbank-Paste ab", () => {
    const volksbank =
      "02.01. 02.01. Basislastschrift 29,95 S\n  AMAZON PAYMENTS EUROPE S.C.A.";
    expect(looksLikeBunqCsv(volksbank)).toBe(false);
  });

  it("lehnt einfaches CSV ohne bunq-Header ab", () => {
    expect(looksLikeBunqCsv("2025-01-01;10,00;REWE;Einkauf")).toBe(false);
  });

  it("toleriert fuehrende Leerzeilen", () => {
    expect(looksLikeBunqCsv("\n\n" + SAMPLE_CSV)).toBe(true);
  });
});

describe("parseBunqCsv", () => {
  it("parst alle Datenzeilen der Beispiel-CSV korrekt", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    expect(txs).toHaveLength(6);
  });

  it("uebertraegt Datum, Wertstellung und Betrag korrekt", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const first = txs[0];
    expect(first.bookingDateISO).toBe("2024-07-02");
    expect(first.valueDateISO).toBe("2024-07-02");
    expect(first.amount).toBe(0.05);
    expect(first.description).toBe("bunq");
  });

  it("unterscheidet Buchungsdatum und Wertstellung (Autorisierungs-Holds)", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const googleAuth = txs.find((t) => t.amount === -1 && t.description.includes("GOOGLE"));
    expect(googleAuth).toBeTruthy();
    expect(googleAuth?.bookingDateISO).toBe("2024-07-08");
    expect(googleAuth?.valueDateISO).toBe("2024-08-01");
  });

  it("setzt merchantKey aus dem Name-Feld", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const openai = txs.find((t) => t.description.includes("OPENAI"));
    expect(openai?.merchantKey).toContain("openai");
    expect(openai?.merchantKey).toContain("chatgpt");
  });

  it("uebernimmt die Description in memoRaw (inkl. Fremdwaehrungs-Info)", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const openai = txs.find((t) => t.description.includes("OPENAI"));
    expect(openai?.memoRaw).toContain("23.80 USD");
    expect(openai?.memoRaw).toContain("0.92983 EUR");
  });

  it("erkennt negative Betraege korrekt", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const authHold = txs.find((t) => t.description.includes("GOOGLE") && t.amount < 0);
    const refund = txs.find((t) => t.description.includes("GOOGLE") && t.amount > 0);
    expect(authHold?.amount).toBe(-1.0);
    expect(refund?.amount).toBe(1.0);
  });

  it("gruppiert gleiche Haendler unter gleichem merchantKey", () => {
    const txs = parseBunqCsv(SAMPLE_CSV);
    const googles = txs.filter((t) => t.description.includes("GOOGLE"));
    expect(googles).toHaveLength(2);
    expect(googles[0].merchantKey).toBe(googles[1].merchantKey);
  });

  it("liefert leeres Array bei fehlendem Header", () => {
    expect(parseBunqCsv(`"foo";"bar"\n"1";"2"`)).toEqual([]);
  });

  it("ueberspringt Zeilen mit ungueltigem Datum", () => {
    const csv = [
      `"Date";"Interest Date";"Amount";"Counterparty";"Name";"Description"`,
      `"kein-datum";"2024-07-02";"0,05";"IBAN";"Name";"Memo"`,
      `"2024-07-02";"2024-07-02";"0,05";"IBAN";"Name";"Memo"`,
    ].join("\n");
    const txs = parseBunqCsv(csv);
    expect(txs).toHaveLength(1);
  });
});

describe("parseBunqCsv (neues 7-Spalten-Format mit Account)", () => {
  it("parst alle drei Beispielbuchungen", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    expect(txs).toHaveLength(3);
  });

  it("uebernimmt Date als bookingDate und Name als Textbasis", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    const first = txs[0];
    expect(first.bookingDateISO).toBe("2026-03-01");
    expect(first.valueDateISO).toBe("2026-03-01");
    expect(first.description).toBe("Thorsten Diederichs");
    expect(first.amount).toBe(108.0);
  });

  it("parst positive und negative Betraege mit deutschem Dezimalkomma", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    const amounts = txs.map((t) => t.amount);
    expect(amounts).toContain(108.0);
    expect(amounts).toContain(-107.1);
    expect(amounts).toContain(-11.3);
  });

  it("verarbeitet leere Counterparty ohne Fehler", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    const claude = txs.find((t) => t.description === "CLAUDE.AI SUBSCRIPTION");
    expect(claude).toBeTruthy();
    expect(claude?.amount).toBe(-107.1);
  });

  it("splittet Description mit Komma im Text nicht falsch", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    const voicy = txs.find((t) => t.description === "VOICY BY PISHI LLC");
    expect(voicy).toBeTruthy();
    // Die gesamte Description inkl. Kommata muss in genau einem Feld landen.
    expect(voicy?.memoRaw).toBe(
      "VOICY BY PISHI LLC ABU DHABI, AE 12.99 USD, 1 USD = 0.86990 EUR",
    );
    expect(voicy?.amount).toBe(-11.3);
  });

  it("setzt merchantKey aus dem Name-Feld", () => {
    const txs = parseBunqCsv(SAMPLE_CSV_V2);
    const anthropic = txs.find((t) => t.description === "Thorsten Diederichs");
    expect(anthropic?.merchantKey).toBeTruthy();
  });
});
