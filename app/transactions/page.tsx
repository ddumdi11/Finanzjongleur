import { revalidatePath } from "next/cache";
import { TransactionCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CATEGORY_VALUES = Object.values(TransactionCategory);
const dateFormatter = new Intl.DateTimeFormat("de-DE");
const amountFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

async function saveCategory(formData: FormData) {
  "use server";

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!transactionId || !CATEGORY_VALUES.includes(categoryRaw as TransactionCategory)) {
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

        // Falls parallel bereits angelegt wurde: bestehende Regel hochziehen.
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

export default async function TransactionsPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { bookingDate: "desc" },
    take: 50,
    include: { account: true },
  });

  return (
    <section className="card transactions-learning">
      <h2>Letzte Buchungen</h2>
      {transactions.length === 0 ? (
        <p>Noch keine Buchungen vorhanden.</p>
      ) : (
        <ul className="transaction-list">
          {transactions.map((transaction) => (
            <li key={transaction.id} className="transaction-row">
              <span>{dateFormatter.format(transaction.bookingDate)}</span>
              <span>
                {transaction.description}
                <br />
                <small>{transaction.account.name}</small>
              </span>
              <span className={`transaction-amount ${Number(transaction.amount) < 0 ? "negative" : "positive"}`}>
                {amountFormatter.format(Number(transaction.amount))}
              </span>
              <form action={saveCategory}>
                <input type="hidden" name="transactionId" value={transaction.id} />
                <select name="category" defaultValue={transaction.category ?? ""}>
                  <option value="" disabled>
                    Kategorie
                  </option>
                  {CATEGORY_VALUES.map((category) => (
                    <option key={category} value={category}>
                      {category}
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
      )}
    </section>
  );
}
