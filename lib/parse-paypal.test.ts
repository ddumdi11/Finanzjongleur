import { describe, it, expect } from "vitest";
import { looksLikePaypalCsv, parsePaypalCsv } from "./parse-paypal";

const SAMPLE = [
  `"Datum","Uhrzeit","Zeitzone","Beschreibung","Währung","Brutto","Entgelt","Netto","Guthaben","Transaktionscode","Absender E-Mail-Adresse","Name","Name der Bank","Bankkonto","Versand- und Bearbeitungsgebühr","Umsatzsteuer","Rechnungsnummer","Zugehöriger Transaktionscode"`,
  `"07.06.2025","19:54:41","Europe/Berlin","PayPal Express-Zahlung","EUR","-29,98","0,00","-29,98","-29,98","7RN16995TB146460R","payments-eur@udemy.com","Udemy Ireland, Ltd",,,"0,00","0,00",,`,
  `"07.06.2025","19:54:41","Europe/Berlin","Bankgutschrift auf PayPal-Konto","EUR","29,98","0,00","29,98","0,00","15K31309P09801716",,,,,"0,00","0,00",,"7RN16995TB146460R"`,
  `"07.06.2025","19:54:58","Europe/Berlin","Spendenzahlung","EUR","-1,00","0,00","-1,00","-1,00","62H21228GG001384M","helfen@kinderprojekt-arche.de","Die Arche Kinderstiftung Christl. Kinder und Jugendwerk",,,"0,00","0,00",,`,
  `"07.06.2025","19:54:58","Europe/Berlin","Bankgutschrift auf PayPal-Konto","EUR","1,00","0,00","1,00","0,00","34P22583EY684002P",,,,,"0,00","0,00",,"62H21228GG001384M"`,
  `"10.06.2025","13:27:03","Europe/Berlin","Bankgutschrift auf PayPal-Konto","EUR","9,15","0,00","9,15","9,15","5A3768181N9193103",,,,,"0,00","0,00",,"1D245889G4815905A"`,
  `"10.06.2025","13:27:03","Europe/Berlin","Allgemeine Währungsumrechnung","EUR","-9,15","0,00","-9,15","0,00","6M291971RA073190J",,,,,"0,00","0,00",,"1D245889G4815905A"`,
  `"23.06.2025","07:47:26","Europe/Berlin","Zahlung im Einzugsverfahren mit Zahlungsrechnung","EUR","-45,00","0,00","-45,00","-45,00","66P65762XY469360T","ppetorocy@etoro.com","eToro (Europe) Ltd",,,"0,00","0,00","66828303","B-5NK67078HF351353K"`,
  `"23.06.2025","07:47:26","Europe/Berlin","Bankgutschrift auf PayPal-Konto","EUR","45,00","0,00","45,00","0,00","9S660860UV1273921",,,,,"0,00","0,00","66828303","66P65762XY469360T"`,
  `"25.06.2025","01:37:54","Europe/Berlin","Rücklastschriftgebühr","EUR","-3,00","0,00","-3,00","-3,00","2S730493R0353781V",,,,,"0,00","0,00","66828303","1H262962GU894722A"`,
].join("\n");

describe("looksLikePaypalCsv", () => {
  it("erkennt den deutschen PayPal-Header", () => {
    expect(looksLikePaypalCsv(SAMPLE)).toBe(true);
  });

  it("lehnt bunq-CSV ab (englische Spaltennamen, Semikolon-Trenner)", () => {
    const bunq =
      `"Date";"Interest Date";"Amount";"Counterparty";"Name";"Description"\n"2024-07-02";"2024-07-02";"0,05";"IBAN";"bunq";"Payday"`;
    expect(looksLikePaypalCsv(bunq)).toBe(false);
  });

  it("lehnt Volksbank-Paste ab", () => {
    const volksbank =
      "02.01. 02.01. Basislastschrift 29,95 S\n  AMAZON PAYMENTS EUROPE S.C.A.";
    expect(looksLikePaypalCsv(volksbank)).toBe(false);
  });
});

describe("parsePaypalCsv", () => {
  it("ueberspringt 'Bankgutschrift auf PayPal-Konto' als interne Gegenbuchung", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const descrs = txs.map((t) => t.description);
    expect(descrs.some((d) => d.includes("Bankgutschrift"))).toBe(false);
  });

  it("ueberspringt 'Allgemeine Waehrungsumrechnung' als Stuetzbuchung", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const descrs = txs.map((t) => t.description);
    expect(descrs.some((d) => d.includes("Währungsumrechnung"))).toBe(false);
  });

  it("liefert genau 4 echte Buchungen aus der Beispiel-CSV", () => {
    // 9 Datenzeilen: Udemy, Udemy-Gegenbuchung, Arche, Arche-Gegenbuchung,
    // Bankgutschrift-FX, Waehrungsumrechnung-FX, eToro, eToro-Gegenbuchung,
    // Ruecklastschriftgebuehr = 4 echte (Udemy, Arche, eToro, Fee)
    const txs = parsePaypalCsv(SAMPLE);
    expect(txs).toHaveLength(4);
  });

  it("nutzt den Name als description und normalisiert ihn als merchantKey", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const udemy = txs.find((t) => t.description.includes("Udemy"));
    expect(udemy).toBeTruthy();
    expect(udemy?.amount).toBe(-29.98);
    expect(udemy?.merchantKey).toContain("udemy");
  });

  it("behaelt Fees wie Ruecklastschriftgebuehr ohne Name", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const fee = txs.find((t) => t.description === "Rücklastschriftgebühr");
    expect(fee).toBeTruthy();
    expect(fee?.amount).toBe(-3.0);
    expect(fee?.merchantKey).toContain("ruecklastschriftgebuehr");
  });

  it("konvertiert DD.MM.YYYY-Datum ins ISO-Format", () => {
    const txs = parsePaypalCsv(SAMPLE);
    expect(txs[0].bookingDateISO).toBe("2025-06-07");
    expect(txs[0].valueDateISO).toBe("2025-06-07");
  });

  it("baut memoRaw mit Beschreibung, E-Mail, Rechnung und TX-Code zusammen", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const etoro = txs.find((t) => t.description.includes("eToro"));
    expect(etoro?.memoRaw).toContain("Einzugsverfahren");
    expect(etoro?.memoRaw).toContain("ppetorocy@etoro.com");
    expect(etoro?.memoRaw).toContain("Rechnung 66828303");
    expect(etoro?.memoRaw).toContain("TX 66P65762XY469360T");
  });

  it("doppelt die Beschreibung nicht ins memoRaw, wenn sie schon als description dient", () => {
    const txs = parsePaypalCsv(SAMPLE);
    const fee = txs.find((t) => t.description === "Rücklastschriftgebühr");
    // memoRaw sollte nicht "Rücklastschriftgebühr" enthalten, da es schon als
    // description ausgewiesen ist.
    expect(fee?.memoRaw ?? "").not.toMatch(/Rücklastschriftgebühr/i);
    // Aber der TX-Code sollte da sein.
    expect(fee?.memoRaw ?? "").toContain("TX 2S730493R0353781V");
  });

  it("liefert leeres Array bei fehlendem oder falschem Header", () => {
    expect(parsePaypalCsv(`"foo","bar"\n"1","2"`)).toEqual([]);
  });

  it("ueberspringt Zeilen mit ungueltigem Datum", () => {
    const csv = [
      `"Datum","Uhrzeit","Zeitzone","Beschreibung","Währung","Brutto","Entgelt","Netto","Guthaben","Transaktionscode","Absender E-Mail-Adresse","Name","Name der Bank","Bankkonto","Versand- und Bearbeitungsgebühr","Umsatzsteuer","Rechnungsnummer","Zugehöriger Transaktionscode"`,
      `"kein-datum","19:54:41","Europe/Berlin","PayPal Express-Zahlung","EUR","-29,98","0,00","-29,98","-29,98","x",,"Udemy Ireland, Ltd",,,"0,00","0,00",,`,
      `"07.06.2025","19:54:41","Europe/Berlin","PayPal Express-Zahlung","EUR","-29,98","0,00","-29,98","-29,98","y",,"Udemy Ireland, Ltd",,,"0,00","0,00",,`,
    ].join("\n");
    const txs = parsePaypalCsv(csv);
    expect(txs).toHaveLength(1);
  });
});
