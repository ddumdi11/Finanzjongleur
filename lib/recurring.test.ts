import { describe, expect, it } from "vitest";
import { computeNextExpectedDate, occurrencesInRange } from "./recurring";

// Helfer, um Zeitzonen-Aerger in Tests zu vermeiden: Datum als YYYY-MM-DD
// lokal um 00:00 konstruieren.
const d = (iso: string): Date => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
};

const iso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

describe("computeNextExpectedDate", () => {
  describe("MONTHLY", () => {
    it("liefert den naechsten Monats-Ersten fuer typische Miete", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          dayOfMonth: 1,
          anchorDate: d("2024-01-01"),
        },
        d("2026-04-21"),
      );
      expect(iso(next)).toBe("2026-05-01");
    });

    it("clippt Tag 31 in Monaten, die nur 30 Tage haben", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          dayOfMonth: 31,
          anchorDate: d("2024-01-31"),
        },
        d("2025-04-05"),
      );
      expect(iso(next)).toBe("2025-04-30");
    });

    it("clippt Tag 31 auf 28. Februar in Nicht-Schaltjahren", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          dayOfMonth: 31,
          anchorDate: d("2024-01-31"),
        },
        d("2025-02-10"),
      );
      expect(iso(next)).toBe("2025-02-28");
    });

    it("clippt auf 29. Februar in Schaltjahren", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          dayOfMonth: 31,
          anchorDate: d("2024-01-31"),
        },
        d("2024-02-10"),
      );
      expect(iso(next)).toBe("2024-02-29");
    });

    it("uebernimmt Tag aus anchorDate, wenn dayOfMonth fehlt", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          anchorDate: d("2024-03-15"),
        },
        d("2026-04-21"),
      );
      expect(iso(next)).toBe("2026-05-15");
    });

    it("gibt anchorDate zurueck, wenn Referenz gleich anchorDate ist", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          anchorDate: d("2026-06-01"),
        },
        d("2026-06-01"),
      );
      expect(iso(next)).toBe("2026-06-01");
    });
  });

  describe("QUARTERLY", () => {
    it("berechnet die naechste Quartals-Rate", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "QUARTERLY",
          dayOfMonth: 15,
          anchorDate: d("2025-01-15"),
        },
        d("2026-04-21"),
      );
      expect(iso(next)).toBe("2026-07-15");
    });

    it("trifft Quartals-Grenze genau", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "QUARTERLY",
          dayOfMonth: 1,
          anchorDate: d("2024-01-01"),
        },
        d("2026-04-01"),
      );
      expect(iso(next)).toBe("2026-04-01");
    });
  });

  describe("YEARLY", () => {
    it("liefert die naechste Jahres-Wiederkehr", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "YEARLY",
          dayOfMonth: 15,
          anchorDate: d("2024-06-15"),
        },
        d("2026-04-21"),
      );
      expect(iso(next)).toBe("2026-06-15");
    });

    it("springt ins naechste Jahr, wenn der Jahrestag schon durch ist", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "YEARLY",
          dayOfMonth: 15,
          anchorDate: d("2024-06-15"),
        },
        d("2026-07-01"),
      );
      expect(iso(next)).toBe("2027-06-15");
    });
  });

  describe("CUSTOM", () => {
    it("rechnet in intervalDays-Schritten ab anchorDate", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "CUSTOM",
          intervalDays: 14,
          anchorDate: d("2026-01-01"),
        },
        d("2026-04-21"),
      );
      // 2026-01-01 + 8 * 14 Tage = 2026-04-23
      expect(iso(next)).toBe("2026-04-23");
    });

    it("wirft, wenn intervalDays fehlt oder <= 0", () => {
      expect(() =>
        computeNextExpectedDate(
          {
            periodicity: "CUSTOM",
            intervalDays: 0,
            anchorDate: d("2026-01-01"),
          },
          d("2026-04-21"),
        ),
      ).toThrow();

      expect(() =>
        computeNextExpectedDate(
          {
            periodicity: "CUSTOM",
            anchorDate: d("2026-01-01"),
          },
          d("2026-04-21"),
        ),
      ).toThrow();
    });
  });

  describe("Anker in der Zukunft", () => {
    it("liefert anchorDate, wenn Referenz davor liegt", () => {
      const next = computeNextExpectedDate(
        {
          periodicity: "MONTHLY",
          dayOfMonth: 1,
          anchorDate: d("2027-01-01"),
        },
        d("2026-04-21"),
      );
      expect(iso(next)).toBe("2027-01-01");
    });
  });
});

describe("occurrencesInRange", () => {
  it("findet alle monatlichen Auftritte in einem 90-Tage-Horizont", () => {
    const dates = occurrencesInRange(
      {
        periodicity: "MONTHLY",
        dayOfMonth: 1,
        anchorDate: d("2024-01-01"),
      },
      d("2026-04-21"),
      d("2026-07-21"),
    );
    expect(dates.map(iso)).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
  });

  it("liefert fuer Quartalszahlung genau ein Auftritt in 90 Tagen, wenn passend", () => {
    const dates = occurrencesInRange(
      {
        periodicity: "QUARTERLY",
        dayOfMonth: 15,
        anchorDate: d("2025-01-15"),
      },
      d("2026-05-01"),
      d("2026-08-01"),
    );
    expect(dates.map(iso)).toEqual(["2026-07-15"]);
  });

  it("liefert leer, wenn Jahreszahlung ausserhalb des Horizonts liegt", () => {
    const dates = occurrencesInRange(
      {
        periodicity: "YEARLY",
        dayOfMonth: 15,
        anchorDate: d("2024-12-15"),
      },
      d("2026-04-21"),
      d("2026-07-21"),
    );
    expect(dates).toHaveLength(0);
  });

  it("liefert leer bei umgekehrtem Intervall", () => {
    const dates = occurrencesInRange(
      {
        periodicity: "MONTHLY",
        anchorDate: d("2024-01-01"),
      },
      d("2026-07-01"),
      d("2026-04-21"),
    );
    expect(dates).toHaveLength(0);
  });

  it("sammelt viele Auftritte bei CUSTOM-Intervall 14 Tage", () => {
    const dates = occurrencesInRange(
      {
        periodicity: "CUSTOM",
        intervalDays: 14,
        anchorDate: d("2026-01-01"),
      },
      d("2026-04-21"),
      d("2026-06-01"),
    );
    // Von 2026-04-21 vorwaerts in 14-Tage-Schritten ab Anker 2026-01-01.
    // Anker + 8*14 = 2026-04-23 (erster Auftritt >= 2026-04-21).
    // Danach 2026-05-07, 2026-05-21.
    expect(dates.map(iso)).toEqual(["2026-04-23", "2026-05-07", "2026-05-21"]);
  });
});
