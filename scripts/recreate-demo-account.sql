-- Recria a conta demo do revisor da App Store / Play Store.
-- Rode no SQL Editor do Supabase (projeto wdtftftwdqtihupbtlxk) sempre que o
-- revisor deletar a conta pelo fluxo de "excluir minha conta" do app.
--
-- Credenciais: applereview@representese.com / Apple123!
--
-- Detalhe chato do GoTrue: os campos de token de auth.users NÃO podem ser NULL,
-- senão o login devolve "Database error querying schema". O bloco abaixo já
-- insere com '' e ainda faz um COALESCE de segurança no fim.

DO $$
DECLARE
  uid uuid := 'a11ce111-1111-4111-8111-111111111111';
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid();
  c5 uuid := gen_random_uuid();
BEGIN
  DELETE FROM auth.users WHERE id = uid OR email = 'applereview@representese.com';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    email_change_confirm_status
  ) VALUES (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'applereview@representese.com',
    extensions.crypt('Apple123!', extensions.gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('sub', uid::text, 'email', 'applereview@representese.com', 'full_name', 'Apple Review', 'email_verified', true, 'phone_verified', false),
    now(), now(), false, false,
    '', '', '', '', '', '', '', '', 0
  );

  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    uid::text, uid,
    jsonb_build_object('sub', uid::text, 'email', 'applereview@representese.com', 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- os triggers já criaram user_entitlements e user_settings com defaults
  UPDATE public.user_entitlements
     SET plan_id='master', subscription_status='active',
         current_period_end='2028-12-31T00:00:00Z', cancel_at_period_end=false,
         billing_cycle='annual', updated_at=now()
   WHERE user_id = uid;

  UPDATE public.user_settings
     SET subscription_plan='Acesso Master', subscription_status='active',
         subscription_valid_until='2028-12-31T00:00:00Z', has_completed_onboarding=true,
         categories = ARRAY['Cozimax','LA Granitos','Kobber'],
         weather_city='Cerquilho', weather_state='SP',
         weather_lat=-23.1636, weather_lng=-47.7419,
         phone='15997472785', updated_at=now()
   WHERE user_id = uid;

  INSERT INTO public.clients (id, user_id, name, cnpj, status, city, state, address, lat, lng, phone, last_contact, category_last_contact) VALUES
    (c1, uid, 'Construtora Horizonte Ltda',       '11222333000181', 'Ativo',   'Sorocaba', 'SP', 'Av. Ipanema, 1200 - Sorocaba/SP',     -23.5015, -47.4526, '15991110001', current_date - 5,  '{"Cozimax": "2026-08-27"}'::jsonb),
    (c2, uid, 'Deposito Central Materiais',        '22333444000172', 'Ativo',   'Itu',      'SP', 'Rua do Carmo, 45 - Itu/SP',           -23.2646, -47.2993, '11991110002', current_date - 12, '{"LA Granitos": "2026-08-20"}'::jsonb),
    (c3, uid, 'Casa e Obra Comercio de Materiais', '33444555000163', 'Alerta',  'Tatui',    'SP', 'Av. Cesario Coimbra, 780 - Tatui/SP', -23.3556, -47.8570, '15991110003', current_date - 34, '{"Kobber": "2026-07-29"}'::jsonb),
    (c4, uid, 'Mega Construcao Salto',             '44555666000154', 'Ativo',   'Salto',    'SP', 'Rua 7 de Setembro, 322 - Salto/SP',   -23.2010, -47.2870, '11991110004', current_date - 3,  '{"Cozimax": "2026-08-29"}'::jsonb),
    (c5, uid, 'Fortaleza Distribuidora de Pisos',  '55666777000145', 'Critico', 'Boituva',  'SP', 'Av. Brasil, 90 - Boituva/SP',         -23.2830, -47.6720, '15991110005', current_date - 48, '{"LA Granitos": "2026-07-15"}'::jsonb);

  INSERT INTO public.orders (user_id, client_id, category, value, order_number, created_at, delivery_date, payment_terms, notes) VALUES
    (uid, c1, 'Cozimax',     4820.00, 'PED-2026-0142', now() - interval '6 days',  current_date + 4,  '28 DDL',    'Pedido de porcelanato linha Atena.'),
    (uid, c2, 'LA Granitos', 7310.50, 'PED-2026-0143', now() - interval '11 days', current_date + 9,  '30/60 DDL', 'Bancadas e soleiras.'),
    (uid, c4, 'Cozimax',     2190.00, 'PED-2026-0151', now() - interval '2 days',  current_date + 12, 'A vista',   NULL);

  INSERT INTO public.appointments (user_id, client_id, title, time, date) VALUES
    (uid, c1, 'Visita - apresentar nova linha Atena', '09:30', current_date + 1),
    (uid, c3, 'Ligar para reativar - 34 dias sem compra', '14:00', current_date + 2),
    (uid, c5, 'Fechar pedido de reposicao', '11:00', current_date + 4);
END $$;

-- COALESCE de segurança + conferência
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email = 'applereview@representese.com';

SELECT u.email, u.email_confirmed_at IS NOT NULL AS confirmed, e.plan_id, e.subscription_status,
       (SELECT count(*) FROM public.clients WHERE user_id=u.id) AS clientes,
       (SELECT count(*) FROM public.orders WHERE user_id=u.id) AS pedidos,
       (SELECT count(*) FROM public.appointments WHERE user_id=u.id) AS compromissos
FROM auth.users u LEFT JOIN public.user_entitlements e ON e.user_id=u.id
WHERE u.email='applereview@representese.com';
