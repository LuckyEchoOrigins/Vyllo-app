-- Colunas para Play Billing (Android).
-- Aditivo: não mexe nas colunas do Stripe nem nas da Apple.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_purchase_token text,
  ADD COLUMN IF NOT EXISTS google_product_id     text,
  ADD COLUMN IF NOT EXISTS google_expires_at     timestamptz;

-- Uma compra do Google só pode estar associada a uma conta.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_google_purchase_token_idx
  ON profiles (google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;
