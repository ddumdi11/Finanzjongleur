import ImportWorkbench from "@/components/import-workbench";
import { prisma } from "@/lib/prisma";
import { createImportedTransactions, extractPdfTextAction } from "./actions";

export default async function ImportPage() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
    },
  });

  return (
    <ImportWorkbench
      accounts={accounts}
      createImportedTransactionsAction={createImportedTransactions}
      extractPdfTextAction={extractPdfTextAction}
    />
  );
}
