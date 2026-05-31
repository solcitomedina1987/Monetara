export type TransactionType = "ingreso" | "gasto" | "transferencia";
export type AccountStatus = "activo" | "inactivo";
export type CategoryStatus = "activo" | "inactivo";

export type ThemePreference = "light" | "dark" | "monetara";

export interface Profile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  avatar_url?: string | null;
  /** Tema guardado en BD; se aplica al cargar el dashboard en un dispositivo nuevo. */
  default_theme?: ThemePreference | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  nombre: string;
  moneda: string;
  saldo_inicial: number;
  estado: AccountStatus;
  is_default: boolean;
  icon_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  nombre: string;
  icono: string | null;
  estado: CategoryStatus;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  nombre: string;
  estado: CategoryStatus;
  created_at: string;
  updated_at: string;
}


export interface Transaction {
  id: string;
  user_id: string;
  monto: number;
  tipo: TransactionType;
  account_id: string;
  category_id: string | null;
  fecha: string;
  notas: string | null;
  to_account_id: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  category?: Category;
  to_account?: Account;
  tags?: Tag[];
}

export interface TransactionTag {
  transaction_id: string;
  tag_id: string;
}

export interface TransactionWithRelations extends Omit<Transaction, "category" | "to_account"> {
  account: Account;
  category: Category | null;
  to_account: Account | null;
  tags: Tag[];
}

export type Currency = {
  code: string;
  name: string;
  symbol: string;
};

export const CURRENCIES: Currency[] = [
  { code: "ARS", name: "Peso Argentino", symbol: "$" },
  { code: "USD", name: "Dólar Estadounidense", symbol: "US$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "BRL", name: "Real Brasileño", symbol: "R$" },
  { code: "CLP", name: "Peso Chileno", symbol: "CL$" },
  { code: "UYU", name: "Peso Uruguayo", symbol: "UY$" },
  { code: "GBP", name: "Libra Esterlina", symbol: "£" },
  { code: "CAD", name: "Dólar Canadiense", symbol: "CA$" },
];

export type DashboardPeriod =
  | "mes_actual"
  | "mes_anterior"
  | "ultimos_3_meses"
  | "año_actual"
  | "ultimo_año"
  | "personalizado";

/** Períodos disponibles en Movimientos (incluye histórico completo). */
export type TransactionPeriod =
  | DashboardPeriod
  | "desde_el_inicio"
  | "hoy"
  | "ultimos_7_dias";

export interface TransactionFilters {
  tipo?: TransactionType | "todos";
  periodo?: TransactionPeriod;
  fechaDesde?: string;
  fechaHasta?: string;
  account_id?: string;
  /** @deprecated Prefer `category_ids`; se mantiene por URLs y datos guardados antiguos. */
  category_id?: string;
  /** Varias categorías: la lista muestra movimientos en cualquiera (OR). */
  category_ids?: string[];
  tag_ids?: string[];
  /** Checkbox ingresos (live filter). Si ambos con gastos están activos, no se filtra por tipo. */
  showIngresos?: boolean;
  /** Checkbox gastos (live filter). */
  showGastos?: boolean;
}

export interface AccountWithBalance extends Account {
  saldo_actual: number;
}

export interface DailySummary {
  fecha: string;
  transactions: TransactionWithRelations[];
  total_ingresos: number;
  total_gastos: number;
  saldo_dia: number;
}

export interface BudgetCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  budget_category_id: string;
  amount: number;
  month: number;
  year: number;
  created_at: string;
  updated_at: string;
}
