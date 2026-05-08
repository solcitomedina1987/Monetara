import { getTransactions, getBalanceBeforePeriod } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { TransactionsClient } from "@/components/transactions/transactions-client";
import type { DashboardPeriod, TransactionFilters } from "@/lib/types";

interface Props {
  searchParams: Promise<{
    periodo?: string;
    account_id?: string;
    category_id?: string;
  }>;
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams;

  const initialFilters: TransactionFilters = {
    periodo: (params.periodo as DashboardPeriod) ?? "mes_actual",
    account_id: params.account_id ?? undefined,
    category_id: params.category_id ?? undefined,
  };

  const [transactions, accounts, categories, tags, startingBalance] = await Promise.all([
    getTransactions(initialFilters),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
    getBalanceBeforePeriod(initialFilters),
  ]);

  return (
    <TransactionsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
      initialStartingBalance={startingBalance}
      initialFilters={initialFilters}
    />
  );
}
