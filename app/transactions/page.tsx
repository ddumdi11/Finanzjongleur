import Link from "next/link";
import { revalidatePath } from "next/cache";
import { TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveTransactionMerchantKey } from "@/lib/merchant";
import {
  TRANSACTION_CATEGORY_VALUES,
  transactionCategoryLabels,
} from "@/lib/category-labels";

const CATEGORY_VALUES = TRANSACTION_CATEGORY_VALUES;
const dateFormatter = new Intl.DateTimeFormat("de-DE");
const amountFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const PAGE_SIZE = 200;

/**
 * Erzeugt eine kompakte Memo-Vorschau aus den ersten beiden nicht-leeren
 * Zeilen des Memo-Felds — genug, um bei PayPal den Haendler zu sehen und
 * bei Supermarkt-Buchungen die Filiale.
 */
function memoPreview(memoRaw: string, max = 140): string {
  const lines = memoRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (lines.length === 0) return "";
  const joined = lines.join(" · ");
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

async function saveCategory(formData: FormData) {
  "use server";

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!transactionId || !CATEGORY_VALUES.includes(categoryRaw as (typeof CATEGORY_VALUES)[number])) {
    return;
  }

  const category = categoryRaw as TransactionCategory;
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    return;
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { category },
  });

  if (transaction.merchantKey && transaction.merchantKey.trim().length > 0) {
    const merchantName = (transaction.merchantName?.trim() || transaction.description.trim() || "Unbekannt").slice(0, 120);
    await prisma.$transaction(async (tx) => {
      const existingRule = await tx.merchantRule.findFirst({
        where: { pattern: transaction.merchantKey! },
        orderBy: { confidence: "desc" },
      });

      if (existingRule) {
        await tx.merchantRule.update({
          where: { id: existingRule.id },
          data: {
            category,
            merchantName,
            confidence: Math.min(100, existingRule.confidence + 10),
          },
        });
        return;
      }

      try {
        await tx.merchantRule.create({
          data: {
            pattern: transaction.merchantKey!,
            merchantName,
            category,
            confidence: 60,
          },
        });
      } catch (error) {
        const prismaCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
        if (prismaCode !== "P2002") {
          throw error;
        }

        const concurrentRule = await tx.merchantRule.findFirst({
          where: { pattern: transaction.merchantKey! },
          orderBy: { confidence: "desc" },
        });
        if (concurrentRule) {
          await tx.merchantRule.update({
            where: { id: concurrentRule.id },
            data: {
              category,
              merchantName,
              confidence: Math.min(100, concurrentRule.confidence + 10),
            },
          });
        }
      }
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/");
}

/**
 * Bulk-Aktion fuer die Buchungsseite: baut MerchantRules aus bereits
 * kategorisierten Buchungen (majority rules pro Merchant) und wendet die
 * Regeln dann auf alle noch unkategorisierten Buchungen an.
 *
 * Der Durchlauf ist idempotent und kann mehrfach ausgeloest werden — jede
 * neue Kategorisier-Runde des Nutzers wird beim naechsten Klick in Regeln
 * ueberfuehrt.
 */
async function rebuildAndApplyRulesAction(_formData: FormData) {
  "use server";
  void _formData;

  // 1. merchantKey fuer alle Buchungen setzen, die noch keinen haben.
  const missingKey = await prisma.transaction.findMany({
    where: { merchantKey: null },
    select: { id: true, memoRaw: true },
  });
  for (const t of missingKey) {
    const key = deriveTransactionMerchantKey(t.memoRaw);
    if (!key) continue;
    await prisma.transaction.update({
      where: { id: t.id },
      data: { merchantKey: key },
    });
  }

  // 2. MerchantRules aus bereits kategorisierten Buchungen ableiten.
  //    Fuer jeden Merchant-Key die MEISTE gewaehlte Kategorie nehmen,
  //    Ties per Anzahl -> Zuletzt-Datum.
  const categorized = await prisma.transaction.findMany({
    where: {
      merchantKey: { not: null },
      category: { not: null },
    },
    select: {
      merchantKey: true,
      category: true,
      description: true,
      memoRaw: true,
      bookingDate: true,
    },
  });

  type Counter = {
    counts: Map<TransactionCategory, number>;
    latestOfBest: Date;
    sampleName: string;
  };
  const byKey = new Map<string, Counter>();
  for (const t of categorized) {
    if (!t.merchantKey || !t.category) continue;
    const entry = byKey.get(t.merchantKey) ?? {
      counts: new Map(),
      latestOfBest: new Date(0),
      sampleName:
        t.memoRaw.split(/\r?\n/).find(Boolean)?.trim().slice(0, 120) ?? t.description.slice(0, 120),
    };
    entry.counts.set(t.category, (entry.counts.get(t.category) ?? 0) + 1);
    if (t.bookingDate > entry.latestOfBest) entry.latestOfBest = t.bookingDate;
    byKey.set(t.merchantKey, entry);
  }

  let rulesUpserted = 0;
  for (const [key, { counts, sampleName }] of byKey) {
    let bestCategory: TransactionCategory | null = null;
    let bestCount = 0;
    for (const [cat, c] of counts) {
      if (c > bestCount) {
        bestCount = c;
        bestCategory = cat;
      }
    }
    if (!bestCategory) continue;

    const existing = await prisma.merchantRule.findFirst({
      where: { pattern: key },
      orderBy: { confidence: "desc" },
    });
    if (existing) {
      if (existing.category !== bestCategory || existing.merchantName !== sampleName) {
        await prisma.merchantRule.update({
          where: { id: existing.id },
          data: {
            category: bestCategory,
            merchantName: sampleName,
            confidence: Math.min(100, existing.confidence + 10),
          },
        });
        rulesUpserted += 1;
      }
    } else {
      await prisma.merchantRule.create({
        data: {
          pattern: key,
          category: bestCategory,
          merchantName: sampleName,
          confidence: 60,
        },
      });
      rulesUpserted += 1;
    }
  }

  // 3. Alle noch unkategorisierten Buchungen gegen die jetzigen Regeln
  //    laufen lassen.
  const rules = await prisma.merchantRule.findMany({
    select: { pattern: true, category: true, merchantName: true },
  });
  const ruleByPattern = new Map(rules.map((r) => [r.pattern, r]));

  const uncategorized = await prisma.transaction.findMany({
    where: {
      category: null,
      merchantKey: { not: null },
    },
    select: { id: true, merchantKey: true },
  });

  let applied = 0;
  for (const t of uncategorized) {
    if (!t.merchantKey) continue;
    const rule = ruleByPattern.get(t.merchantKey);
    if (!rule) continue;
    await prisma.transaction.update({
      where: { id: t.id },
      data: {
        category: rule.category,
        merchantName: rule.merchantName,
      },
    });
    applied += 1;
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  // Nichts weiter zu tun — der Nutzer sieht den aktualisierten Zaehler
  // oben auf der Seite.
}

type TransactionsPageProps = {
  searchParams: Promise<{ only?: string }>;
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams;
  const onlyUncategorized = params.only === "uncategorized";

  const [transactions, uncategorizedCount, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where: onlyUncategorized ? { category: null } : {},
      orderBy: { bookingDate: "desc" },
      take: PAGE_SIZE,
      include: { account: true },
    }),
    prisma.transaction.count({ where: { category: null } }),
    prisma.transaction.count(),
  ]);

  const categorizedCount = totalCount - uncategorizedCount;

  return (
    <section className="card transactions-learning">
      <h2>Buchungen</h2>

      <p>
        {totalCount.toLocaleString("de-DE")} Buchungen insgesamt ·{" "}
        <strong>{uncategorizedCount.toLocaleString("de-DE")}</strong> noch ohne
        Kategorie ·{" "}
        {categorizedCount.toLocaleString("de-DE")} bereits zugeordnet
      </p>

      <p>
        {onlyUncategorized ? (
          <>
            Anzeige: nur unkategorisierte ·{" "}
            <Link href="/transactions">Alle anzeigen</Link>
          </>
        ) : (
          <>
            Anzeige: alle ·{" "}
            <Link href="/transactions?only=uncategorized">
              Nur unkategorisierte anzeigen
            </Link>
          </>
        )}
      </p>

      <div style={{ margin: "0.5em 0 1em 0" }}>
        <form action={rebuildAndApplyRulesAction} style={{ display: "inline" }}>
          <button type="submit">Regeln aktualisieren &amp; anwenden</button>
        </form>{" "}
        <small>
          Baut Händler-Regeln aus deinen bisherigen Kategorisierungen und wendet
          sie auf alle noch unkategorisierten Buchungen an.
        </small>
      </div>

      {transactions.length === 0 ? (
        <p>
          {onlyUncategorized
            ? "Alle Buchungen sind kategorisiert. 🎯"
            : "Noch keine Buchungen vorhanden."}
        </p>
      ) : (
        <>
          <p>
            <small>
              Zeige {transactions.length.toLocaleString("de-DE")}
              {transactions.length === PAGE_SIZE ? ` (Limit ${PAGE_SIZE})` : null}
              {" · "}
              sortiert nach Buchungsdatum (neueste zuerst)
            </small>
          </p>
          <ul className="transaction-list">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="transaction-row">
                <span>{dateFormatter.format(transaction.bookingDate)}</span>
                <span>
                  {transaction.description}
                  <br />
                  {(() => {
                    const memo = memoPreview(transaction.memoRaw);
                    return (
                      <small>
                        {memo ? `${memo} · ` : null}
                        {transaction.account.name}
                      </small>
                    );
                  })()}
                </span>
                <span className={`transaction-amount ${Number(transaction.amount) < 0 ? "negative" : "positive"}`}>
                  {amountFormatter.format(Number(transaction.amount))}
                </span>
                <form action={saveCategory}>
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <select
                    name="category"
                    defaultValue={transaction.category ?? ""}
                    key={transaction.category ?? "__none__"}
                  >
                    <option value="" disabled>
                      Kategorie
                    </option>
                    {CATEGORY_VALUES.map((category) => (
                      <option key={category} value={category}>
                        {transactionCategoryLabels[category]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={{ marginLeft: "0.5rem" }}>
                    Speichern
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
