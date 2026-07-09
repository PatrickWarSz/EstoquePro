// src/components/pwa-updater.tsx
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

// Guardiões de ambiente (iguais aos do main.tsx)
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com") || host === "localhost" || host === "127.0.0.1";

export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Ignora se estiver no iframe do painel de desenvolvimento
      if (isInIframe || isPreviewHost) return;

      // Procura por atualizações silenciosamente a cada 15 minutos
      // (era 1 hora; com autoUpdate, quanto mais rápido checar, mais
      // rápido um bug corrigido chega em quem já está com o app aberto)
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

    // Rede de segurança do modo "autoUpdate": quando o novo Service Worker
    // assume o controle da página, a aba recarrega sozinha uma única vez
    // pra buscar o JS/CSS novo. Sem isso, quem já está com o app aberto há
    // horas pode continuar rodando código antigo mesmo com o SW já trocado.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (isInIframe || isPreviewHost) return;

    if (needRefresh) {
      toast('Nova versão disponível! 🚀', {
        description: 'Clique para atualizar o sistema com as melhorias mais recentes.',
        duration: Infinity, // Fica na tela até ele clicar
        position: 'bottom-center', // Fica visível e não atrapalha
        action: {
          label: 'Atualizar',
          onClick: () => updateServiceWorker(true),
        },
        cancel: {
          label: 'Depois',
          onClick: () => setNeedRefresh(false), // Esconde o aviso, mas não atualiza
        },
      });
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null; // O componente em si não renderiza nada visualmente, só o Toast
}