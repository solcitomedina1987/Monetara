import { redirect } from "next/navigation";
import { getProfile } from "@/app/actions/profile";
import { ProfileClient } from "@/components/profile/profile-client";

export default async function PerfilPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return <ProfileClient initialProfile={profile} />;
}
