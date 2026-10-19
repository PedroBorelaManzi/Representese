-- Aplicada em produção via MCP apply_migration (2026-10-19).
-- Gatilhos de rate limit: o Postgres só checa EXECUTE na criação do trigger, nunca ao
-- disparar, então não precisam ficar expostos em /rest/v1/rpc.
revoke execute on function public.enforce_ads_funnel_events_rate_limit() from public, anon, authenticated;
revoke execute on function public.enforce_consent_log_rate_limit()       from public, anon, authenticated;
revoke execute on function public.enforce_landing_events_rate_limit()    from public, anon, authenticated;

-- Código de indicação: só usuário logado (a função já usa auth.uid()).
revoke execute on function public.generate_my_referral_code() from public, anon;
grant  execute on function public.generate_my_referral_code() to authenticated;
