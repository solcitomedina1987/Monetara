"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Account, AccountWithBalance } from "@/lib/types";

export async function getAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data as Account[];
}

export async function getActiveAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw error;
  return data as Account[];
}

export async function createAccount(payload: {
  nombre: string;
  moneda: string;
  saldo_inicial: number;
  icon_url?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("accounts")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return data as Account;
}

export async function updateAccount(id: string, payload: Partial<Account>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return data as Account;
}

export async function deactivateAccount(id: string) {
  return updateAccount(id, { estado: "inactivo" });
}

export async function activateAccount(id: string) {
  return updateAccount(id, { estado: "activo" });
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_account_balance", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return data ?? 0;
}

export async function getAccountsWithBalance(): Promise<AccountWithBalance[]> {
  const accounts = await getAccounts();
  const balances = await Promise.all(accounts.map((a) => getAccountBalance(a.id)));
  return accounts.map((a, i) => ({ ...a, saldo_actual: balances[i] }));
}

export async function getDefaultAccount(): Promise<Account | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("is_default", true)
    .eq("estado", "activo")
    .maybeSingle();
  if (error) throw error;
  return data as Account | null;
}

export async function setDefaultAccount(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Clear previous default
  await supabase
    .from("accounts")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  // Set new default
  const { error } = await supabase
    .from("accounts")
    .update({ is_default: true })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/perfil");
}

export async function clearDefaultAccount(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase
    .from("accounts")
    .update({ is_default: false })
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/perfil");
}
