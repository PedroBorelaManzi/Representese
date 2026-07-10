-- user_entitlements só tinha policy de leitura do próprio dono, sem bypass de
-- admin (diferente de user_settings). O Admin Analytics (CRM de leads) lia o
-- status de assinatura de user_settings.subscription_status — coluna legada
-- com default 'active' que nunca é atualizada pelo webhook de pagamento — e
-- por isso mostrava todo cadastro como "Assinante", pago ou não. Agora que o
-- Admin Analytics passa a ler user_entitlements (fonte de verdade), o admin
-- precisa de permissão para ver todas as linhas, não só a própria.
CREATE POLICY "Admins can read all entitlements" ON public.user_entitlements
  FOR SELECT USING (is_support_admin(auth.uid()));
