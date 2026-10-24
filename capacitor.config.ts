import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.representese.app',
  appName: 'Representese',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_launcher",
      iconColor: "#10b981"
    },
    // 'body' redimensiona a tela quando o teclado abre, em vez de deixar o
    // WebView do jeito que estava e o teclado simplesmente cobrir por cima —
    // sem isso, um campo perto do rodapé (ex.: comentário, CNPJ no modal)
    // podia ficar tampado pelo teclado em alguns aparelhos/versões do Android.
    // Android 15+ (SDK 35/36) desenha o app de ponta a ponta. O CSS do app já
    // usa env(safe-area-inset-*) (viewport-fit=cover no index.html); "cover" aqui
    // evita o "pulo" de layout no primeiro quadro.
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover"
    },
    Keyboard: {
      resize: "body"
    }
  }
};

export default config;
