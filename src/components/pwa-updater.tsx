// src/components/pwa-updater.tsx
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Guardiões de ambiente (iguais aos do main.tsx)
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com") || host === "localhost" || host === "127.0.0.1";

// Atualização 100% automática — o SW gerado (registerType:"autoUpdate") já
// ativa a versão nova sozinho (skipWaiting) assim que ela termina de instalar.
// Este componente só cuida de: (1) checar por atualizações periodicamente e
// (2) recarregar a aba quando o SW novo assume o controle — SEM interromper
// o funcionário se ele estiver no meio de um campo de texto (ex. digitando
// uma quantidade no scanner), pra não apagar o que ele estava lançando.
export function PwaUpdater() {
  useRegisterSW({
    onRegistered(r) {
      if (isInIframe || isPreviewHost) return;

      // Procura por atualizações silenciosamente a cada 15 minutos.
      if (r) {
        setInterval(() => {
          r.update();
        }, 15 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (isInIframe || isPreviewHost) return;
    if (!("serviceWorker" in navigator)) return;

    let hasReloaded = false;

    function reloadNow() {
      if (hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    }

    function onControllerChange() {
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";

      if (isTyping) {
        // Espera o funcionário sair do campo (ex. terminar de digitar a
        // quantidade) antes de recarregar, pra não perder o lançamento.
        document.addEventListener("focusout", reloadNow, { once: true });
        return;
      }

      reloadNow();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
