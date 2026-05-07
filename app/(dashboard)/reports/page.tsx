import { getTransactions } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { ReportsClient } from "@/components/dashboard/reports-client";

export default async function ReportsPage() {
  const [transactions, accounts, categories] = await Promise.all([
    getTransactions({}),
    getActiveAccounts(),
    getActiveCategories(),
  ]);

  return (
    <ReportsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
    />
  );
}
