import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { TransactionEditPage } from "@/components/transactions/transaction-edit-page";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTransactionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: transaction } = await supabase
    .from("transactions")
    .select(`*, tags:transaction_tags(tag:tags(*))`)
    .eq("id", id)
    .single();

  if (!transaction) notFound();

  const [accounts, categories, tags] = await Promise.all([
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
  ]);

  const txWithTags = {
    ...transaction,
    tags: transaction.tags?.map((t: any) => t.tag).filter(Boolean) ?? [],
  };

  return (
    <TransactionEditPage
      transaction={txWithTags}
      accounts={accounts}
      categories={categories}
      tags={tags}
    />
  );
}
