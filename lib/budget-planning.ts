/** Mes de planificación por defecto: mes actual (ingresos y gastos del mismo período) */
export function getDefaultPlanningPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function shiftPlanningPeriod(
  month: number,
  year: number,
  delta: -1 | 1
): { month: number; year: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export function formatPlanningMonthLabel(month: number, year: number): string {
  const raw = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
