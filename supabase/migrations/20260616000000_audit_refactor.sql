-- 1. Criao da tabela user_entitlements
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT 'none',
  subscription_status text NOT NULL DEFAULT 'inactive',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read entitlements" ON public.user_entitlements;
CREATE POLICY "owner can read entitlements" ON public.user_entitlements FOR SELECT USING (auth.uid() = user_id);

-- 2. Backfill de user_settings para user_entitlements
INSERT INTO public.user_entitlements (user_id, plan_id, subscription_status, trial_ends_at)
SELECT user_id, COALESCE(plan_id, 'none'), 'trialing', now() + interval '7 days'
FROM public.user_settings
ON CONFLICT (user_id) DO NOTHING;

-- 3. Trigger aditivo para novos usurios
CREATE OR REPLACE FUNCTION public.handle_new_user_entitlement()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, plan_id, subscription_status, trial_ends_at)
  VALUES (new.id, 'none', 'trialing', now() + interval '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_entitlement ON auth.users;
CREATE TRIGGER on_auth_user_created_entitlement
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_entitlement();

-- 4. Tabela de coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  code text PRIMARY KEY,
  discount_percent int NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  active boolean DEFAULT true,
  max_redemptions int,
  times_redeemed int DEFAULT 0,
  expires_at timestamptz,
  applies_to_plans text[] NULL
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

INSERT INTO public.coupons (code, discount_percent, active) VALUES
('REPRESENTE95', 95, true),
('TESTE', 50, true),
('GRATIS100', 100, true)
ON CONFLICT (code) DO NOTHING;

-- 5. Tabela de billing_identities
CREATE TABLE IF NOT EXISTS public.billing_identities (
  user_id uuid REFERENCES auth.users(id),
  cpf_cnpj_normalized text UNIQUE NOT NULL,
  phone_normalized text UNIQUE,
  PRIMARY KEY (user_id)
);

ALTER TABLE public.billing_identities ENABLE ROW LEVEL SECURITY;


-- Add increment_coupon function
CREATE OR REPLACE FUNCTION public.increment_coupon(c_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.coupons SET times_redeemed = times_redeemed + 1 WHERE code = c_code;
$$;
