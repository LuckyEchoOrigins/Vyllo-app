-- Tabela de perfis com estado premium do Stripe
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium      boolean DEFAULT false,
  stripe_customer_id    text,
  stripe_subscription_id text,
  stripe_plan     text,   -- 'monthly' | 'annual' | 'lifetime'
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilizador vê o seu perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Criar perfil automaticamente ao registar
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
