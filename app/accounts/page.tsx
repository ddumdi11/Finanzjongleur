import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { accountTypeLabels } from "@/lib/account-labels";

const dateFormatter = new Intl.DateTimeFormat("de-DE");

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { transactions: true } },
      transactions: {
        select: { bookingDate: true, amount: true },
        orderBy: { bookingDate: "desc" },
        take: 1,
      },
    },
  });

  return (
    <section className="card">
      <h2>Konten</h2>
      <p>
        Übersicht aller angelegten Konten.{" "}
        <Link href="/konten/neu">Neues Konto anlegen</Link>.
      </p>

      {accounts.length === 0 ? (
        <p>Noch keine Konten vorhanden.</p>
      ) : (
        <ul>
          {accounts.map((account) => {
            const amountFormatter = new Intl.NumberFormat("de-DE", {
              style: "currency",
              currency: account.currency,
            });

            const lastTx = account.transactions[0];
            const lastAmount = lastTx ? Number(lastTx.amount) : null;
            const typeLabel = accountTypeLabels[account.type] ?? account.type;

            return (
              <li key={account.id}>
                <strong>{account.name}</strong>{" "}
                <span>
                  ({typeLabel}, {account.currency})
                </span>
                <br />
                <small>
                  {account._count.transactions === 0
                    ? "noch keine Buchungen"
                    : `${account._count.transactions} Buchung${
                        account._count.transactions === 1 ? "" : "en"
                      }`}
                  {lastTx && lastAmount !== null
                    ? ` · zuletzt ${dateFormatter.format(
                        new Date(lastTx.bookingDate),
                      )} (${amountFormatter.format(lastAmount)})`
                    : null}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
