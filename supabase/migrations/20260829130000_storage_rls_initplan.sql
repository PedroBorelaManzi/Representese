-- Performance de RLS nas policies de Storage (buckets client_vault e user_files).
--
-- Mesmo problema do auth_rls_initplan: `auth.uid()` / `auth.role()` soltos são
-- reavaliados a cada objeto listado/baixado. Envolver em (select ...) resolve.
-- Isto importa porque toda listagem de arquivos e todo download de PDF de pedido
-- passa por estas policies.
--
-- Zero mudança de semântica: continua "cada usuário só enxerga a própria pasta"
-- (primeiro segmento do path == user_id).

-- ── bucket client_vault ──────────────────────────────────────────────────
alter policy "Authenticated users can view their files" on storage.objects
  using (
    bucket_id = 'client_vault'
    and (select auth.role()) = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "Authenticated users can upload files to their folder" on storage.objects
  with check (
    bucket_id = 'client_vault'
    and (select auth.role()) = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "Authenticated users can update their files" on storage.objects
  using (
    bucket_id = 'client_vault'
    and (select auth.role()) = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'client_vault'
    and (select auth.role()) = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "Authenticated users can delete their files" on storage.objects
  using (
    bucket_id = 'client_vault'
    and (select auth.role()) = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── bucket user_files ────────────────────────────────────────────────────
alter policy "user_files_select" on storage.objects
  using (
    bucket_id = 'user_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "user_files_insert" on storage.objects
  with check (
    bucket_id = 'user_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "user_files_update" on storage.objects
  using (
    bucket_id = 'user_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy "user_files_delete" on storage.objects
  using (
    bucket_id = 'user_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
