/** Primer y último día del mes (YYYY-MM-DD) para filtros estrictos en transacciones */
export function getMonthDateRange(month: number, year: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** Visible desde el mes de creación (inclusive) hacia adelante */
export function isBudgetCategoryVisibleInPeriod(
  createdAt: string,
  month: number,
  year: number
): boolean {
  const d = new Date(createdAt);
  const cy = d.getFullYear();
  const cm = d.getMonth() + 1;
  if (year > cy) return true;
  if (year === cy && month >= cm) return true;
  return false;
}

export function calculateBudgetLimit(totalIncome: number, percentage: number): number {
  if (totalIncome <= 0 || percentage <= 0) return 0;
  return Math.round(totalIncome * (percentage / 100) * 100) / 100;
}

export function calculateProgressPercent(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((spent / limit) * 10000) / 100);
}

export function isOverBudget(spent: number, limit: number): boolean {
  return limit > 0 && spent > limit;
}
