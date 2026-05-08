import { getAccountsWithBalance } from "@/app/actions/accounts";
import { AccountsClient } from "@/components/accounts/accounts-client";

export default async function AccountsPage() {
  const accounts = await getAccountsWithBalance();
  return <AccountsClient initialAccounts={accounts} />;
}
