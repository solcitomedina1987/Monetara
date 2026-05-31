"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  calculateBudgetLimit,
  getMonthDateRange,
  isBudgetCategoryVisibleInPeriod,
} from "@/lib/budget-calculations";
import type { BudgetCategory, BudgetMonthSummary } from "@/lib/types";

async function syncExpenseCategoryLinks(
  budgetCategoryId: string,
  linkedCategoryIds: string[]
) {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("categories")
    .update({ budget_category_id: null })
    .eq("budget_category_id", budgetCategoryId);
  if (clearError) throw clearError;

  if (linkedCategoryIds.length === 0) return;

  const { error: linkError } = await supabase
    .from("categories")
    .update({ budget_category_id: budgetCategoryId })
    .in("id", linkedCategoryIds);
  if (linkError) throw linkError;
}

export async function getBudgetCategories(): Promise<BudgetCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as BudgetCategory),
    percentage: Number(row.percentage ?? 0),
  }));
}

export async function getBudgetMonthSummary(
  month: number,
  year: number
): Promise<BudgetMonthSummary> {
  const supabase = await createClient();
  const { from, to } = getMonthDateRange(month, year);

  const [
    { data: budgetCats, error: bcErr },
    { data: expenseCats, error: ecErr },
    { data: incomeTxs, error: inErr },
    { data: expenseTxs, error: exErr },
  ] = await Promise.all([
    supabase.from("budget_categories").select("*").order("name"),
    supabase
      .from("categories")
      .select("id, nombre, budget_category_id")
      .eq("estado", "activo"),
    supabase
      .from("transactions")
      .select("monto")
      .eq("tipo", "ingreso")
      .gte("fecha", from)
      .lte("fecha", to),
    supabase
      .from("transactions")
      .select("monto, category_id")
      .eq("tipo", "gasto")
      .gte("fecha", from)
      .lte("fecha", to),
  ]);

  if (bcErr) throw bcErr;
  if (ecErr) throw ecErr;
  if (inErr) throw inErr;
  if (exErr) throw exErr;

  const totalIncome =
    Math.round(
      (incomeTxs?.reduce((sum, t) => sum + Number(t.monto), 0) ?? 0) * 100
    ) / 100;

  const categoryToBudget = new Map<string, string>();
  for (const cat of expenseCats ?? []) {
    if (cat.budget_category_id) {
      categoryToBudget.set(cat.id, cat.budget_category_id);
    }
  }

  const spentByBudget = new Map<string, number>();
  for (const tx of expenseTxs ?? []) {
    if (!tx.category_id) continue;
    const budgetId = categoryToBudget.get(tx.category_id);
    if (!budgetId) continue;
    const prev = spentByBudget.get(budgetId) ?? 0;
    spentByBudget.set(budgetId, prev + Number(tx.monto));
  }

  const visible = (budgetCats ?? []).filter((bc) =>
    isBudgetCategoryVisibleInPeriod(bc.created_at, month, year)
  );

  const categories = visible.map((bc) => {
    const percentage = Number(bc.percentage ?? 0);
    const linked = (expenseCats ?? [])
      .filter((c) => c.budget_category_id === bc.id)
      .map((c) => ({ id: c.id, nombre: c.nombre }));

    return {
      id: bc.id,
      name: bc.name,
      icon: bc.icon,
      percentage,
      created_at: bc.created_at,
      limitAmount: calculateBudgetLimit(totalIncome, percentage),
      spentAmount:
        Math.round((spentByBudget.get(bc.id) ?? 0) * 100) / 100,
      linkedCategories: linked,
    };
  });

  const totalAssignedPercent =
    Math.round(categories.reduce((sum, c) => sum + c.percentage, 0) * 100) / 100;

  return {
    month,
    year,
    totalIncome,
    totalAssignedPercent,
    categories,
  };
}

export async function createBudgetCategory(payload: {
  name: string;
  icon?: string | null;
  percentage: number;
  linkedCategoryIds: string[];
}): Promise<BudgetCategory> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const pct = Math.min(100, Math.max(0, Math.round(payload.percentage * 100) / 100));

  const { data, error } = await supabase
    .from("budget_categories")
    .insert({
      name: payload.name.trim(),
      icon: payload.icon ?? null,
      percentage: pct,
      user_id: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  await syncExpenseCategoryLinks(data.id, payload.linkedCategoryIds);

  revalidatePath("/budgets");
  return { ...(data as BudgetCategory), percentage: Number(data.percentage) };
}

export async function updateBudgetCategory(
  id: string,
  payload: {
    name: string;
    icon?: string | null;
    percentage: number;
    linkedCategoryIds: string[];
  }
): Promise<BudgetCategory> {
  const supabase = await createClient();
  const pct = Math.min(100, Math.max(0, Math.round(payload.percentage * 100) / 100));

  const { data, error } = await supabase
    .from("budget_categories")
    .update({
      name: payload.name.trim(),
      icon: payload.icon ?? null,
      percentage: pct,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await syncExpenseCategoryLinks(id, payload.linkedCategoryIds);

  revalidatePath("/budgets");
  return { ...(data as BudgetCategory), percentage: Number(data.percentage) };
}

export async function deleteBudgetCategory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("budget_categories").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/budgets");
}

export async function getLinkedCategoryIds(budgetCategoryId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("budget_category_id", budgetCategoryId);
  if (error) throw error;
  return (data ?? []).map((c) => c.id);
}

export async function getBudgetsPageData(month: number, year: number) {
  const { getActiveCategories } = await import("@/app/actions/categories");
  const [summary, expenseCategories] = await Promise.all([
    getBudgetMonthSummary(month, year),
    getActiveCategories(),
  ]);
  return { summary, expenseCategories };
}
