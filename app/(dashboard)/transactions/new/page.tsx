import { getActiveAccounts, getDefaultAccount } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { TransactionFormPage } from "@/components/transactions/transaction-form-page";

interface Props {
  searchParams: Promise<{ tipo?: string }>;
}

export default async function NewTransactionPage({ searchParams }: Props) {
  const params = await searchParams;
  const [accounts, categories, tags, defaultAccount] = await Promise.all([
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
    getDefaultAccount(),
  ]);

  return (
    <TransactionFormPage
      accounts={accounts}
      categories={categories}
      tags={tags}
      defaultTipo={(params.tipo as any) ?? "gasto"}
      defaultAccountId={defaultAccount?.id ?? null}
    />
  );
}
