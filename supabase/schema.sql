-- ============================================================
-- FINANZAS APP - Supabase Schema con Row Level Security (RLS)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  apellido    TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger para auto-crear profile al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, apellido, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. ACCOUNTS (Cuentas)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  moneda        TEXT NOT NULL DEFAULT 'ARS',
  saldo_inicial NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_own" ON accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "accounts_insert_own" ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "accounts_update_own" ON accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "accounts_delete_own" ON accounts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. CATEGORIES (Categorías)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, nombre)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_own" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "categories_insert_own" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update_own" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "categories_delete_own" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. TAGS (Etiquetas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, nombre)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_select_own" ON tags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tags_insert_own" ON tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags_update_own" ON tags
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tags_delete_own" ON tags
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 5. TRANSACTIONS (Transacciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monto         NUMERIC(15,2) NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto', 'transferencia')),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT,
  to_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transferencia_requires_to_account
    CHECK (tipo != 'transferencia' OR to_account_id IS NOT NULL),
  CONSTRAINT transferencia_accounts_different
    CHECK (to_account_id IS NULL OR account_id != to_account_id)
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_own" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update_own" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_delete_own" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 7. TRANSACTION_TAGS (Relación N:N Transacciones <-> Etiquetas)
-- ============================================================
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transaction_tags_select_own" ON transaction_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM transactions WHERE id = transaction_id AND user_id = auth.uid())
  );

CREATE POLICY "transaction_tags_insert_own" ON transaction_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM transactions WHERE id = transaction_id AND user_id = auth.uid())
  );

CREATE POLICY "transaction_tags_delete_own" ON transaction_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM transactions WHERE id = transaction_id AND user_id = auth.uid())
  );

-- ============================================================
-- 8. ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fecha ON transactions(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tipo ON transactions(tipo);

-- ============================================================
-- 9. FUNCIÓN: obtener saldo actual de una cuenta
-- ============================================================
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT
    a.saldo_inicial
    + COALESCE(SUM(CASE
        WHEN t.tipo = 'ingreso' THEN t.monto
        WHEN t.tipo = 'gasto' THEN -t.monto
        WHEN t.tipo = 'transferencia' AND t.account_id = p_account_id THEN -t.monto
        WHEN t.tipo = 'transferencia' AND t.to_account_id = p_account_id THEN t.monto
        ELSE 0
      END), 0) AS balance
  FROM accounts a
  LEFT JOIN transactions t ON (t.account_id = p_account_id OR t.to_account_id = p_account_id)
  WHERE a.id = p_account_id
  GROUP BY a.saldo_inicial;
$$;

-- ============================================================
-- 10. FUNCIÓN: saldo total real (todos los ingresos − todos los gastos)
--     Equivale a: SELECT sum(monto), tipo FROM transactions GROUP BY tipo
--     filtrado por el usuario autenticado.
-- ============================================================
CREATE OR REPLACE FUNCTION get_total_balance()
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    SUM(CASE
      WHEN tipo = 'ingreso' THEN monto
      WHEN tipo = 'gasto'   THEN -monto
      ELSE 0
    END), 0)
  FROM transactions
  WHERE user_id = auth.uid();
$$;

-- ============================================================
-- 11. TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
