import { getBudgetsPageData } from "@/app/actions/budgets";
import { BudgetsClient } from "@/components/budgets/budgets-client";
import { getDefaultPlanningPeriod } from "@/lib/budget-planning";

export default async function BudgetsPage() {
  const { month, year } = getDefaultPlanningPeriod();
  const { summary, expenseCategories } = await getBudgetsPageData(month, year);

  return (
    <BudgetsClient
      initialSummary={summary}
      expenseCategories={expenseCategories}
      initialMonth={month}
      initialYear={year}
    />
  );
}
