-- ============================================================
-- Presupuestos por porcentaje + vínculo N:1 (categorías de gasto)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE budget_categories
  ADD COLUMN IF NOT EXISTS percentage NUMERIC(5, 2) NOT NULL DEFAULT 0
  CHECK (percentage >= 0 AND percentage <= 100);

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS budget_category_id UUID
  REFERENCES budget_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_budget_category_id
  ON categories(budget_category_id);
