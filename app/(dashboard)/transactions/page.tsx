import { getTransactions, getTotalBalance } from "@/app/actions/transactions";
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
    fechaDesde?: string;
    fechaHasta?: string;
  }>;
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams;

  const periodo = (params.periodo as DashboardPeriod) ?? "mes_actual";
  const initialFilters: TransactionFilters = {
    periodo,
    account_id:  params.account_id  ?? undefined,
    category_id: params.category_id ?? undefined,
    ...(periodo === "personalizado" && params.fechaDesde && params.fechaHasta
      ? { fechaDesde: params.fechaDesde, fechaHasta: params.fechaHasta }
      : {}),
  };

  const [transactions, accounts, categories, tags, referenceTotalBalance] = await Promise.all([
    getTransactions(initialFilters),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
    getTotalBalance(initialFilters.account_id),
  ]);

  return (
    <TransactionsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
      referenceTotalBalance={referenceTotalBalance}
      initialFilters={initialFilters}
    />
  );
}
