# Limpeza do projeto Represente-Se!
# Move arquivos desnecessários para o Lixo de Reciclagem (recuperável)

$shell = New-Object -ComObject Shell.Application
$recyclebin = $shell.Namespace(10)

$base = "C:\Users\Pedro\PROJETOS\Represente-Se!"

$itens = @(
    # Scripts de correção avulsos
    "fix_landing_perf.cjs",
    "fix_landing_perf2.cjs",
    "fix_ui_2.cjs",
    "convert.cjs",
    "update_code.cjs",
    # Documentos de auditoria/planejamento obsoletos
    "AUDITORIA_2_Representese.md",
    "AUDITORIA_COMPLETA_ANTIGRAVITY.md",
    "AUDITORIA_E_PROMPTS_Representese.md",
    "HANDOFF_continuidade.md",
    "PLANO_CORRECAO_ANTIGRAVITY.md",
    "STATUS_FINAL_verificacao.md",
    # Pastas de resultado de testes
    "playwright-report",
    "test-results"
)

foreach ($item in $itens) {
    $caminho = Join-Path $base $item
    if (Test-Path $caminho) {
        $recyclebin.MoveHere($caminho)
        Write-Host "Movido para lixeira: $item"
    } else {
        Write-Host "Nao encontrado (ignorado): $item"
    }
}

Write-Host ""
Write-Host "Limpeza concluida! Os itens estao na Lixeira e podem ser recuperados se necessario."
