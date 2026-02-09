import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
  });
  const transactions = await prisma.transaction.findMany({
    orderBy: { bookingDate: "desc" },
    include: { account: true },
  });

  const dateFormatter = new Intl.DateTimeFormat("de-DE");

  return (
    <section className="grid">
      <article className="card">
        <h2>Konten</h2>
        {accounts.length === 0 ? (
          <p>Noch keine Konten vorhanden</p>
        ) : (
          <ul>
            {accounts.map((account) => {
              const accountTransactions = transactions.filter((transaction) => transaction.accountId === account.id).slice(0, 10);
              const amountFormatter = new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: account.currency,
              });

              return (
                <li key={account.id}>
                  <strong>
                    {account.name} ({account.type}, {account.currency})
                  </strong>
                  {accountTransactions.length === 0 ? (
                    <p>Noch keine Buchungen</p>
                  ) : (
                    <ul className="transaction-list">
                      {accountTransactions.map((transaction) => {
                        const numericAmount = Number(transaction.amount);
                        return (
                          <li key={transaction.id} className="transaction-row">
                            <span>{dateFormatter.format(new Date(transaction.bookingDate))}</span>
                            <span>{transaction.description || transaction.counterparty}</span>
                            <span className={`transaction-amount ${numericAmount < 0 ? "negative" : "positive"}`}>
                              {amountFormatter.format(numericAmount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
