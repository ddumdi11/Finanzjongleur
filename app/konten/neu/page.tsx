import { AccountType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function createAccount(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as AccountType;
  const currency = String(formData.get("currency") ?? "")
    .trim()
    .toUpperCase();

  if (!name) {
    throw new Error("Name ist erforderlich.");
  }

  if (!Object.values(AccountType).includes(type)) {
    throw new Error("Ungültiger Kontotyp.");
  }

  if (!currency || currency.length !== 3) {
    throw new Error("Währung muss ein 3-stelliger Code sein.");
  }

  await prisma.account.create({
    data: {
      name,
      type,
      currency,
    },
  });

  revalidatePath("/");
  redirect("/");
}

export default function NewAccountPage() {
  return (
    <section className="card">
      <h2>Neues Konto anlegen</h2>
      <form action={createAccount}>
        <p>
          <label htmlFor="name">Name</label>
          <br />
          <input id="name" name="name" type="text" required />
        </p>

        <p>
          <label htmlFor="type">Typ</label>
          <br />
          <select id="type" name="type" defaultValue={AccountType.CHECKING} required>
            {Object.values(AccountType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </p>

        <p>
          <label htmlFor="currency">Währung</label>
          <br />
          <input
            id="currency"
            name="currency"
            type="text"
            defaultValue="EUR"
            minLength={3}
            maxLength={3}
            required
          />
        </p>

        <button type="submit">Konto speichern</button>
      </form>
    </section>
  );
}
