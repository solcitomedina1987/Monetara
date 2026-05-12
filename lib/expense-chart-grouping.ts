/** Shared with Dashboard and Reportes: same slice grouping as dashboard donut charts. */

export type ExpenseEntry = { name: string; value: number; category_id: string | null };
export type GroupedExpenseEntry = ExpenseEntry & { isVarios?: boolean };

export type TagExpenseEntry = { name: string; value: number; tag_id: string | null };
export type GroupedTagExpenseEntry = TagExpenseEntry & { isVarios?: boolean };

/** Group categories < 5% of total into "Varios" */
export function groupSmallSlices(data: ExpenseEntry[]): GroupedExpenseEntry[] {
  const total = data.reduce((s, e) => s + e.value, 0);
  if (total === 0) return data;
  const threshold = total * 0.05;
  const main: GroupedExpenseEntry[] = data.filter((e) => e.value >= threshold);
  const varios = data.filter((e) => e.value < threshold);
  if (varios.length > 0) {
    main.push({
      name: "Varios",
      value: varios.reduce((s, e) => s + e.value, 0),
      category_id: null,
      isVarios: true,
    });
  }
  return main;
}

/** Group tags < 5% of total into "Varios" */
export function groupSmallTagSlices(data: TagExpenseEntry[]): GroupedTagExpenseEntry[] {
  const total = data.reduce((s, e) => s + e.value, 0);
  if (total === 0) return data;
  const threshold = total * 0.05;
  const main: GroupedTagExpenseEntry[] = data.filter((e) => e.value >= threshold);
  const varios = data.filter((e) => e.value < threshold);
  if (varios.length > 0) {
    main.push({
      name: "Varios",
      value: varios.reduce((s, e) => s + e.value, 0),
      tag_id: null,
      isVarios: true,
    });
  }
  return main;
}
