import { redirect } from "next/navigation";
import { getProfile } from "@/app/actions/profile";
import { getActiveAccounts } from "@/app/actions/accounts";
import { ProfileClient } from "@/components/profile/profile-client";

export default async function PerfilPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const accounts = await getActiveAccounts();

  return <ProfileClient initialProfile={profile} initialAccounts={accounts} />;
}
