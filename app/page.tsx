export default function HomePage() {
  return (
    <section className="grid">
      <article className="card">
        <h2>MVP-Status</h2>
        <p>Grundgerüst erstellt: Kontenansicht, Text-/Dateiimport und Dedupe-Entscheidung.</p>
      </article>
      <article className="card">
        <h2>Nächster Schritt</h2>
        <p>Prisma-Migration ausführen und Importdaten in der Datenbank speichern.</p>
      </article>
    </section>
  );
}
