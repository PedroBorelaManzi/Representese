const { execSync } = require('child_process');

try {
  // Obter arquivos que estão no index para o commit
  const files = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.trim().length > 0);

  const secretPatterns = [
    /GEMINI_API_KEY\s*=\s*['"][a-zA-Z0-9_.\-+/=]{10,}['"]/i,
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][a-zA-Z0-9_.\-+/=]{10,}['"]/i,
    /OPENAI_API_KEY\s*=\s*['"][a-zA-Z0-9_.\-+/=]{10,}['"]/i
  ];

  for (const file of files) {
    // Ignora arquivos apagados ou não de texto
    try {
      const content = execSync(`git show :${file}`, { encoding: 'utf-8' });
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          console.error(`\x1b[31mErro de Seguranca: Padrao de chave secreta encontrado no arquivo ${file}\x1b[0m`);
          console.error(`Por favor, remova chaves hardcoded e use variaveis de ambiente.`);
          process.exit(1);
        }
      }
    } catch (e) {
      // Arquivo apagado ou binário, segue em frente
    }
  }

  process.exit(0);
} catch (error) {
  console.error('Erro ao verificar chaves:', error);
  process.exit(1);
}
