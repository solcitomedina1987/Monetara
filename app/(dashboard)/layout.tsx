import { getProfile } from "@/app/actions/profile";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  return <DashboardShell initialProfile={profile}>{children}</DashboardShell>;
}
