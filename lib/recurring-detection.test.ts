import { describe, expect, it } from "vitest";
import {
  DetectionInput,
  detectRecurringCandidates,
  deriveMerchantKey,
} from "./recurring-detection";

function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}

function monthly(
  startIso: string,
  months: number,
  opts: { amount: number; memo: string; accountId?: string },
): DetectionInput[] {
  const out: DetectionInput[] = [];
  const [y, m, day] = startIso.split("-").map(Number);
  for (let i = 0; i < months; i++) {
    const date = new Date(y, m - 1 + i, day, 0, 0, 0, 0);
    out.push({
      bookingDate: date,
      amount: opts.amount,
      description: "Basislastschrift",
      memoRaw: opts.memo,
      accountId: opts.accountId ?? "acc1",
    });
  }
  return out;
}

describe("deriveMerchantKey", () => {
  it("baut einen stabilen Schluessel aus den ersten beiden Memo-Zeilen", () => {
    const key = deriveMerchantKey(
      "AMAZON PAYMENTS EUROPE S.C.A.\nD01-7760613-3048603 AMZNPrime DE 2234EO4GAM7L4KF3 EREF\n: 2234EO4GAM7L4KF3 MREF: .anuoP(MKLN)vnVX09tyottC1UD3+",
    );
    expect(key).toContain("amazon");
    expect(key).toContain("amznprime");
  });

  it("trennt verschiedene Amazon-Produkte trotz identischer erster Zeile", () => {
    const prime = deriveMerchantKey(
      "AMAZON PAYMENTS EUROPE S.C.A.\nD01-7760613-3048603 AMZNPrime DE 2234EO4GAM7L4KF3 EREF",
    );
    const kindle = deriveMerchantKey(
      "AMAZON MEDIA EU S.A R.L.\nD01-2573584-2907811 Kindle Unltd 6JY6NLVRXX0ZN0YT EREF",
    );
    const audible = deriveMerchantKey(
      "AUDIBLE GMBH\nD01-3250491-1679003 Audible Gmbh 65QBPK98J252G620 EREF",
    );
    expect(prime).not.toBe(kindle);
    expect(kindle).not.toBe(audible);
    expect(prime).not.toBe(audible);
  });
});

describe("detectRecurringCandidates", () => {
  it("erkennt eine saubere monatliche Lastschrift mit hoher Konfidenz", () => {
    const txns = monthly("2025-01-01", 12, {
      amount: -567,
      memo: "a.h.f. Immobilien-Verwaltungs-GmbH\nMANDATSREF. 2300/01104",
    });
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("MONTHLY");
    expect(candidates[0].dayOfMonth).toBe(1);
    expect(candidates[0].expectedAmount).toBe(-567);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(100);
    expect(candidates[0].sourceCount).toBe(12);
  });

  it("verwirft Gruppen mit weniger als 3 Buchungen", () => {
    const txns = monthly("2025-01-15", 2, {
      amount: -9.99,
      memo: "Netflix\nStreaming Abo",
    });
    expect(detectRecurringCandidates(txns)).toHaveLength(0);
  });

  it("verwirft Gruppen mit Zeitspanne unter 60 Tagen", () => {
    const memo = "ERGO Krankenversiche\nM101045196634";
    const txns: DetectionInput[] = [
      { bookingDate: d("2025-01-01"), amount: -52.5, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-01-20"), amount: -52.5, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-02-15"), amount: -52.5, description: "x", memoRaw: memo, accountId: "acc1" },
    ];
    // Spanne 2025-02-15 - 2025-01-01 = 45 Tage < 60 → verworfen
    expect(detectRecurringCandidates(txns)).toHaveLength(0);
  });

  it("erkennt quartalsweise Zahlung", () => {
    const txns: DetectionInput[] = [
      d("2024-01-01"),
      d("2024-04-01"),
      d("2024-07-01"),
      d("2024-10-01"),
      d("2025-01-01"),
    ].map((date) => ({
      bookingDate: date,
      amount: -55.08,
      description: "Basislastschrift",
      memoRaw: "Rundfunk ARD, ZDF, DRadio\nBeitragsnr",
      accountId: "acc1",
    }));
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("QUARTERLY");
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it("klassifiziert 14-Tage-Rhythmus als CUSTOM", () => {
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(2025, 0, 1 + i * 14, 0, 0, 0, 0);
      txns.push({
        bookingDate: date,
        amount: -9.99,
        description: "x",
        memoRaw: "Bi-Weekly Dienst\nProduktzeile",
        accountId: "acc1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("CUSTOM");
    expect(candidates[0].intervalDays).toBe(14);
  });

  it("verwirft Gruppen mit stark schwankenden Perioden", () => {
    const memo = "Zufallskauf Merchant\nSpontan";
    const txns: DetectionInput[] = [
      { bookingDate: d("2025-01-01"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-01-15"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-04-20"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-06-01"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
    ];
    expect(detectRecurringCandidates(txns)).toHaveLength(0);
  });

  it("verwirft gemischte Vorzeichen (mal plus, mal minus)", () => {
    const memo = "Merchant Mixed\nIrgendwas";
    const txns: DetectionInput[] = [
      { bookingDate: d("2025-01-01"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-02-01"), amount: +10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-03-01"), amount: -10, description: "x", memoRaw: memo, accountId: "acc1" },
      { bookingDate: d("2025-04-01"), amount: +10, description: "x", memoRaw: memo, accountId: "acc1" },
    ];
    expect(detectRecurringCandidates(txns)).toHaveLength(0);
  });

  it("erkennt mehrere Merchants in einer Gesamt-Analyse", () => {
    const all = [
      ...monthly("2025-01-01", 6, {
        amount: -567,
        memo: "a.h.f. Immobilien-Verwaltungs-GmbH\nMANDATSREF. 2300/01104",
      }),
      ...monthly("2025-01-15", 6, {
        amount: -9.99,
        memo: "AMAZON DIGITAL GERMANY GMBH\nAmazon Music",
      }),
    ];
    const candidates = detectRecurringCandidates(all);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.merchantKey).sort().length).toBe(2);
  });

  it("setzt sourceNote mit lesbarem Zeitraum", () => {
    const txns = monthly("2025-01-15", 12, {
      amount: -8.99,
      memo: "AMAZON EU S.A R.L., NIEDERLASSUNG DEUTSCHLAND\nAMZNPrime DE",
    });
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceNote).toBe("12 Buchungen · Jan 2025 – Dez 2025");
  });

  it("erkennt ERGO trotz wechselnder Mandats-Teilnummern und Tagesdaten", () => {
    // Simuliert echte Volksbank-Memos mit variablen Zahlen-Tokens pro Monat.
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 12; i++) {
      const month = i + 1;
      // Tages-Teile und interne IDs veraendern sich jeden Monat.
      const id1 = 1021135223835 + i;
      const id2 = 1021135267379 + i;
      const eref = 7871463949 + i;
      const memo =
        `ERGO Krankenversiche\nM101045196634 37.80 ${id1} KRANKEN 01.${String(month).padStart(2, "0")}.26 14.\n70 ${id2} KRANKEN 01.${String(month).padStart(2, "0")}.26 Wir sagen Danke EREF\n: ${eref} MREF: M101045196634 CRED: DE52EDK00000041\n713`;
      txns.push({
        bookingDate: new Date(2025, i, 2, 0, 0, 0, 0),
        amount: -52.5,
        description: "Basislastschrift",
        memoRaw: memo,
        accountId: "acc1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("MONTHLY");
    expect(candidates[0].sourceCount).toBe(12);
  });

  it("erkennt E.ON trotz variierendem deutschem Monatsnamen im Memo", () => {
    const months = [
      "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember",
    ];
    const txns: DetectionInput[] = months.map((monthName, i) => ({
      bookingDate: new Date(2025, i, 7, 0, 0, 0, 0),
      amount: -29.00,
      description: "Basislastschrift",
      memoRaw: `E.ON Energie Deutschland GmbH\nAbschlag (Strom) ${monthName} / 2025 Kunden-Nr. 202329132 /\n404714287 EREF`,
      accountId: "acc1",
    }));
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("MONTHLY");
    expect(candidates[0].sourceCount).toBe(12);
  });

  it("toleriert eine Retoure (gemischtes Vorzeichen in einem Monat)", () => {
    const base = "Telekom Deutschland GmbH\nFestnetz Vertragskonto 5630430454 RG";
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 11; i++) {
      txns.push({
        bookingDate: new Date(2025, i, 23, 0, 0, 0, 0),
        amount: -47.95,
        description: "Basislastschrift",
        memoRaw: base,
        accountId: "acc1",
      });
    }
    // Retoure: in Monat 11 wird die Buchung zurueckgegeben
    txns.push({
      bookingDate: new Date(2025, 10, 23, 0, 0, 0, 0),
      amount: +47.95,
      description: "Retouren",
      memoRaw: base,
      accountId: "acc1",
    });
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("MONTHLY");
    expect(candidates[0].expectedAmount).toBe(-47.95);
    // Die Retoure wurde aus der Analyse gefiltert, sourceCount zaehlt die
    // Mehrheit.
    expect(candidates[0].sourceCount).toBe(11);
  });

  it("extrahiert den PayPal-Haendler in der Label-Anzeige", () => {
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 12; i++) {
      const eref = 1047519348042 + i;
      txns.push({
        bookingDate: new Date(2025, i, 13, 0, 0, 0, 0),
        amount: -8.97,
        description: "Basislastschrift",
        memoRaw: `PayPal Europe S.a.r.l. et Cie S.C.A\n${eref}/PP.4546.PP/. ardour.org, Ihr Einkauf bei\nardour.org EREF`,
        accountId: "acc1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toContain("PayPal");
    expect(candidates[0].label).toContain("ardour.org");
  });

  it("trennt zwei verschiedene PayPal-Haendler in getrennte Kandidaten", () => {
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 8; i++) {
      const erefA = 1047519348042 + i;
      const erefB = 2047519348042 + i;
      txns.push({
        bookingDate: new Date(2025, i, 13, 0, 0, 0, 0),
        amount: -8.97,
        description: "Basislastschrift",
        memoRaw: `PayPal Europe S.a.r.l. et Cie S.C.A\n${erefA}/PP.4546.PP/. ardour.org, Ihr Einkauf bei`,
        accountId: "acc1",
      });
      txns.push({
        bookingDate: new Date(2025, i, 15, 0, 0, 0, 0),
        amount: -7.72,
        description: "Basislastschrift",
        memoRaw: `PayPal Europe S.a.r.l. et Cie S.C.A\n${erefB}/PP.4546.PP/. MyHeritage Ltd, Ihr Einkauf`,
        accountId: "acc1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(2);
    const labels = candidates.map((c) => c.label);
    expect(labels.some((l) => /ardour/i.test(l))).toBe(true);
    expect(labels.some((l) => /myheritage/i.test(l))).toBe(true);
  });

  it("nutzt bei bunq die description als Label statt der wechselnden Memo-Zeile", () => {
    // bunq-Format: parser setzt description = Name-Feld ("bunq BV"),
    // memoRaw = Description-Feld ("invoice 38495247" mit wechselnder Nummer).
    const txns: DetectionInput[] = [];
    for (let i = 0; i < 12; i++) {
      txns.push({
        bookingDate: new Date(2025, i, 19, 0, 0, 0, 0),
        amount: -9.99,
        description: "bunq BV",
        memoRaw: `invoice ${30000000 + i}`,
        accountId: "bunq1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("bunq BV");
  });

  it("nutzt bei generischer Volksbank-Buchungsart weiterhin die Memo-Zeile", () => {
    const txns = monthly("2025-01-01", 12, {
      amount: -567,
      memo: "a.h.f. Immobilien-Verwaltungs-GmbH\nMANDATSREF. 2300/01104",
    });
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toContain("Immobilien");
  });

  it("toleriert leichte Betragsschwankung ohne Bonus, aber bleibt erkannt", () => {
    // 12 monatliche mit Betrag 29,00 bis 35,00 (Strom-Abschlag)
    const txns: DetectionInput[] = [];
    const amounts = [-29, -29, -30, -31, -32, -33, -33, -32, -31, -30, -29, -29];
    for (let i = 0; i < 12; i++) {
      txns.push({
        bookingDate: new Date(2025, i, 7, 0, 0, 0, 0),
        amount: amounts[i],
        description: "Basislastschrift",
        memoRaw: "E.ON Energie Deutschland GmbH\nAbschlag Strom",
        accountId: "acc1",
      });
    }
    const candidates = detectRecurringCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].periodicity).toBe("MONTHLY");
    expect(candidates[0].amountTolerance).toBeGreaterThan(0);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(80);
  });
});
