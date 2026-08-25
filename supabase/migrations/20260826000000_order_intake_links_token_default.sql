-- A coluna token nasceu NOT NULL e sem DEFAULT, mas nenhum caminho do código
-- grava ela: o insert de SettingsTeam manda só user_id e label. Resultado:
-- criar um link para funcionário sempre falhava com "null value in column
-- token of relation order_intake_links violates not-null constraint" — a
-- tabela estava vazia desde o lançamento do recurso.
--
-- O sorteio fica no banco, e não no navegador, de propósito: o token é o
-- segredo que dá acesso ao formulário de pedidos. Gerado aqui, ele tem sempre
-- os 122 bits de aleatoriedade do UUID v4, venha o insert de onde vier, e o
-- cliente nunca escolhe o próprio segredo. Sem os hífens porque o valor vai
-- direto na URL (/enviar/<token>), virando 32 caracteres hexadecimais.
ALTER TABLE public.order_intake_links
  ALTER COLUMN token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
