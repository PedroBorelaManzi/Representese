import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { fecharSobreposicaoDoTopo } from "../lib/backOverlays";

/**
 * Mounted once near o app root. Sem isso, o botão físico "Voltar" do Android
 * fecha o app inteiro em vez de voltar pra tela anterior dentro do WebView.
 */
export default function BackButtonHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      // Um visualizador/modal aberto por cima da página tem prioridade: sem
      // isso, voltar fechava o visualizador e ainda saía da página atrás dele.
      if (fecharSobreposicaoDoTopo()) return;

      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
