-- Auditoria 2026-08-07 · SEC-03
--
-- Os buckets estavam com file_size_limit e allowed_mime_types nulos: um
-- assinante podia subir 100 GB, ou um .html que vira página executável servida
-- por URL assinada.
--
-- 25 MB por arquivo cobre PDF de pedido, foto de tabela e planilha com folga.
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv','text/plain'
    ]
where id in ('client_vault','user_files');

-- Nota: o bucket 'client-documents' não tem nenhuma policy e nenhum código do
-- app o utiliza. Ficou de fora de propósito — apagar é decisão do dono.
