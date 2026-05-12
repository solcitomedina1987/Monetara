import { getTransactions } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { AnalysisClient } from "@/components/analysis/analysis-client";
import type { TransactionFilters } from "@/lib/types";

const INITIAL_FILTERS: TransactionFilters = {
  periodo: "ultimo_año",
  showIngresos: true,
  showGastos: true,
};

export default async function AnalisisPage() {
  const [transactions, accounts, categories, tags] = await Promise.all([
    getTransactions(INITIAL_FILTERS),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
  ]);

  return (
    <AnalysisClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
    />
  );
}
