import { getTransactions } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { TransactionsClient } from "@/components/transactions/transactions-client";

export default async function TransactionsPage() {
  const [transactions, accounts, categories, tags] = await Promise.all([
    getTransactions({ periodo: "mes_actual" }),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
  ]);

  return (
    <TransactionsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
    />
  );
}
