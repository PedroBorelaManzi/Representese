ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS subscription_valid_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
