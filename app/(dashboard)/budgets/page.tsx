import { getBudgetCategories, getBudgetsForMonth } from "@/app/actions/budgets";
import { BudgetsClient } from "@/components/budgets/budgets-client";
import { getDefaultPlanningPeriod } from "@/lib/budget-planning";

export default async function BudgetsPage() {
  const { month, year } = getDefaultPlanningPeriod();
  const [categories, budgets] = await Promise.all([
    getBudgetCategories(),
    getBudgetsForMonth(month, year),
  ]);

  return (
    <BudgetsClient
      initialCategories={categories}
      initialBudgets={budgets}
      initialMonth={month}
      initialYear={year}
    />
  );
}
