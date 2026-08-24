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
    Keyboard: {
      resize: "body"
    }
  }
};

export default config;
