const demoAccounts = [
  { name: "Girokonto", type: "CHECKING", balance: "2.310,00 €" },
  { name: "Kreditkarte", type: "CREDIT_CARD", balance: "-320,40 €" },
  { name: "Tagesgeld", type: "SAVINGS", balance: "8.500,00 €" }
];

export default function AccountsPage() {
  return (
    <section className="card">
      <h2>Konten</h2>
      <p>Diese Seite dient als Startpunkt für die Kontenverwaltung.</p>
      <ul>
        {demoAccounts.map((account) => (
          <li key={account.name}>
            <strong>{account.name}</strong> ({account.type}) – {account.balance}
          </li>
        ))}
      </ul>
    </section>
  );
}
