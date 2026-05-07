export type TransactionType = "ingreso" | "gasto" | "transferencia";
export type AccountStatus = "activo" | "inactivo";
export type CategoryStatus = "activo" | "inactivo";

export interface Profile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
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
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  nombre: string;
  estado: CategoryStatus;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  user_id: string;
  nombre: string;
  estado: CategoryStatus;
  created_at: string;
  updated_at: string;
}

export interface CategoryTag {
  category_id: string;
  tag_id: string;
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

export interface TransactionFilters {
  tipo?: TransactionType | "todos";
  periodo?: "mes_actual" | "mes_anterior" | "personalizado";
  fechaDesde?: string;
  fechaHasta?: string;
  account_id?: string;
  category_id?: string;
  tag_ids?: string[];
}

export interface DailySummary {
  fecha: string;
  transactions: TransactionWithRelations[];
  total_ingresos: number;
  total_gastos: number;
  saldo_dia: number;
}
