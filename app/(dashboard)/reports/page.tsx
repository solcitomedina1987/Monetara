import { getTransactions, getExpensesByCategory, getExpensesByTag } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { ReportsClient } from "@/components/dashboard/reports-client";

const INITIAL_FILTERS = { periodo: "mes_actual" as const };

export default async function ReportsPage() {
  const [transactions, accounts, expensesByCategory, expensesByTag] = await Promise.all([
    getTransactions(INITIAL_FILTERS),
    getActiveAccounts(),
    getExpensesByCategory(INITIAL_FILTERS),
    getExpensesByTag(INITIAL_FILTERS),
  ]);

  return (
    <ReportsClient
      initialTransactions={transactions}
      initialExpensesByCategory={expensesByCategory}
      initialExpensesByTag={expensesByTag}
      accounts={accounts}
    />
  );
}
