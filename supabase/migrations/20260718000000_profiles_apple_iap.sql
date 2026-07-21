-- Colunas para In-App Purchase da Apple.
-- Aditivo: não mexe nas colunas do Stripe (web/Android continuam a funcionar).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS apple_product_id              text,
  ADD COLUMN IF NOT EXISTS apple_expires_at              timestamptz;

-- Uma compra da Apple só pode estar associada a uma conta.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_apple_original_tx_idx
  ON profiles (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;
