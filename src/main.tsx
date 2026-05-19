import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ---------------------------------------------------------------------------
// PWA - Registro do Service Worker
// ---------------------------------------------------------------------------
// Guards: nunca registra dentro de iframe (preview do Lovable) nem em hosts
// de preview. Em dev também não roda (devOptions.enabled = false no Vite).
// ---------------------------------------------------------------------------
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (isInIframe || isPreviewHost) {
  // Limpa qualquer SW antigo dentro do preview para evitar cache travado
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
} else {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* PWA opcional - silencioso se falhar */
    });
}
