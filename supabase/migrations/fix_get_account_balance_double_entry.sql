-- Alinear get_account_balance con transferencias por doble asiento:
-- solo ingreso/gasto con account_id = cuenta cuentan; no duplicar el contra-asiento
-- cuando solo coincide to_account_id.
--
-- Ejecutá este archivo en el SQL Editor de Supabase si ya tenías la función anterior.

CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT
    a.saldo_inicial
    + COALESCE(SUM(CASE
        WHEN t.tipo = 'ingreso' AND t.account_id = p_account_id THEN t.monto
        WHEN t.tipo = 'gasto' AND t.account_id = p_account_id THEN -t.monto
        WHEN t.tipo = 'transferencia' AND t.account_id = p_account_id THEN -t.monto
        WHEN t.tipo = 'transferencia' AND t.to_account_id = p_account_id THEN t.monto
        ELSE 0
      END), 0) AS balance
  FROM accounts a
  LEFT JOIN transactions t ON (
    (t.tipo IN ('ingreso', 'gasto') AND t.account_id = p_account_id)
    OR (t.tipo = 'transferencia' AND (t.account_id = p_account_id OR t.to_account_id = p_account_id))
  )
  WHERE a.id = p_account_id
  GROUP BY a.saldo_inicial;
$$;

SELECT pg_notify('pgrst', 'reload schema');
