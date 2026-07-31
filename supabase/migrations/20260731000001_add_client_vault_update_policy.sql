-- O bucket client_vault tinha políticas de INSERT, SELECT e DELETE, mas não de UPDATE.
-- Como os uploads de pedido usam { upsert: true }, reenviar um arquivo já existente
-- vira um UPDATE em storage.objects e batia em "new row violates row-level security
-- policy" — era o erro que aparecia ao tentar anexar o pedido de novo.
CREATE POLICY "Authenticated users can update their files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'client_vault'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'client_vault'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
