-- A revogação anterior (FROM PUBLIC, na migration
-- create_represented_companies_intake_system) não bastou: o Supabase
-- concede EXECUTE a "anon" e "authenticated" diretamente via ALTER DEFAULT
-- PRIVILEGES do schema public, não através de PUBLIC — então revogar de
-- PUBLIC não tira o grant que o papel "anon" já tinha na própria conta
-- dele. Revoga explicitamente de "anon": estas funções são só pro
-- representante logado (auth.uid() IS NULL já bloqueava a chamada, mas não
-- faz sentido deixar a superfície exposta a quem nem logou).
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_represented_company(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_rep_to_company(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_represented_company(text, text, text, text, text, text, text) FROM anon;
