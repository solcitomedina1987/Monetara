"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Budget, BudgetCategory } from "@/lib/types";

export async function getBudgetCategories(): Promise<BudgetCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as BudgetCategory[];
}

export async function createBudgetCategory(name: string, icon?: string | null): Promise<BudgetCategory> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ name: name.trim(), icon: icon ?? null, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/budgets");
  return data as BudgetCategory;
}

export async function updateBudgetCategory(
  id: string,
  name: string,
  icon?: string | null
): Promise<BudgetCategory> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .update({ name: name.trim(), icon: icon ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/budgets");
  return data as BudgetCategory;
}

export async function deleteBudgetCategory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("budget_categories").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/budgets");
}

export async function getBudgetsForMonth(month: number, year: number): Promise<Budget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("month", month)
    .eq("year", year);
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...(b as Budget),
    amount: Number(b.amount),
  }));
}

export async function saveBudgetsForMonth(
  month: number,
  year: number,
  entries: { budget_category_id: string; amount: number }[]
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  for (const entry of entries) {
    const amount = Math.round(Math.max(0, entry.amount) * 100) / 100;

    if (amount <= 0) {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("user_id", user.id)
        .eq("budget_category_id", entry.budget_category_id)
        .eq("month", month)
        .eq("year", year);
      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from("budgets").upsert(
      {
        user_id: user.id,
        budget_category_id: entry.budget_category_id,
        amount,
        month,
        year,
      },
      { onConflict: "user_id,budget_category_id,month,year" }
    );
    if (error) throw error;
  }

  revalidatePath("/budgets");
}
