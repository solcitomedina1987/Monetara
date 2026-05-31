-- ============================================================
-- PRESUPUESTOS: budget_categories + budgets
-- Ejecutar en el SQL Editor de Supabase (Dashboard → SQL)
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS budgets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_category_id  UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  amount              NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  month               INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year                INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, budget_category_id, month, year)
);

ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_categories_select_own" ON budget_categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "budget_categories_insert_own" ON budget_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_categories_update_own" ON budget_categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "budget_categories_delete_own" ON budget_categories
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "budgets_select_own" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "budgets_insert_own" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budgets_update_own" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "budgets_delete_own" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_budget_categories_user_id ON budget_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(budget_category_id);

CREATE TRIGGER set_budget_categories_updated_at
  BEFORE UPDATE ON budget_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
