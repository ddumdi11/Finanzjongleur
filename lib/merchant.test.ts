import { describe, it, expect } from "vitest";
import { deriveTransactionMerchantKey, normalizeMerchant } from "./merchant";

describe("normalizeMerchant", () => {
  it("liefert bei leerer Eingabe einen leeren Schluessel", () => {
    expect(normalizeMerchant("")).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
  });

  it("filtert IBAN, BIC, lange Nummern und Rausch-Token", () => {
    const key = normalizeMerchant(
      "ERGO Krankenversiche EREF: 7871463949 MREF: M101045196634 CRED: DE52EDK00000041713",
    );
    expect(key).toContain("ergo");
    expect(key).toContain("krankenversiche");
    expect(key).not.toContain("eref");
    expect(key).not.toContain("mref");
    expect(key).not.toContain("cred");
    expect(key).not.toContain("7871463949");
  });

  it("ist stabil bei geringfuegigen Formatunterschieden", () => {
    const a = normalizeMerchant("REWE Markt GmbH");
    const b = normalizeMerchant("  rewe   markt gmbh  ");
    expect(a).toBe(b);
  });
});

describe("deriveTransactionMerchantKey", () => {
  it("nutzt die erste Memo-Zeile", () => {
    const key = deriveTransactionMerchantKey(
      "REWE Markt GmbH\nREWE SAGT DANKE. 43400163/Koelner La/Duesseldorf Wers/\n30.12.2025 um 18:12:22 Uhr",
    );
    expect(key).toContain("rewe");
    expect(key).toContain("markt");
  });

  it("liefert null fuer leere Eingabe", () => {
    expect(deriveTransactionMerchantKey("")).toBeNull();
    expect(deriveTransactionMerchantKey("\n\n   \n")).toBeNull();
  });

  it("ignoriert Zeilen nach der ersten", () => {
    const key = deriveTransactionMerchantKey(
      "ALDI SE U. CO. KG\nNUERNBERGER STR. 37/DUESSELDORF",
    );
    // Die zweite Zeile mit Filialadresse soll den Schluessel nicht beeinflussen.
    const key2 = deriveTransactionMerchantKey(
      "ALDI SE U. CO. KG\nKOELNER LANDSTR. 203-213/DUESSELDORF",
    );
    expect(key).toBe(key2);
  });
});
