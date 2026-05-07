import { getAccounts } from "@/app/actions/accounts";
import { AccountsClient } from "@/components/accounts/accounts-client";

export default async function AccountsPage() {
  const accounts = await getAccounts();
  return <AccountsClient initialAccounts={accounts} />;
}
