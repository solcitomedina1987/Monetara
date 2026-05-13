import { getTransactions } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { ReportsClient } from "@/components/dashboard/reports-client";
import { DEFAULT_TRANSACTION_FILTERS } from "@/lib/transaction-filters";

export default async function ReportsPage() {
  const [transactions, accounts, categories, tags] = await Promise.all([
    getTransactions(DEFAULT_TRANSACTION_FILTERS),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
  ]);

  return (
    <ReportsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
    />
  );
}
