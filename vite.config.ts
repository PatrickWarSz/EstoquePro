import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // "autoUpdate": assim que uma versão nova é publicada, o app atualiza
      // sozinho (sem depender do usuário clicar em "Atualizar" no aviso).
      // Antes era "prompt", que deixava o usuário preso na versão antiga
      // indefinidamente se ele clicasse em "Depois" (ou nem visse o aviso).
      registerType: "autoUpdate",
      // Desativado no dev para não interferir com o preview do Lovable
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],
      workbox: {
        // Nunca cachear rotas internas sensíveis (OAuth/callbacks)
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/],
        // HTML sempre via rede primeiro, evita "shell" travado
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "EstoquePro — VEXO",
        short_name: "EstoquePro",
        description:
          "O fluxo inteligente da matéria-prima que move sua fábrica.",
        start_url: "/app/estoque",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#2563EB",
        background_color: "#FFFFFF",
        lang: "pt-BR",
        id: "/",
        shortcuts: [ // <--- ADICIONE ESTE BLOCO INTEIRO
          {
            name: "Abrir Scanner",
            short_name: "Scanner",
            description: "Ler QR Code de estoque",
            url: "/app/scanner",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }]
          },
          {
            name: "Novo Pedido",
            short_name: "Pedidos",
            description: "Gerenciar pedidos",
            url: "/app/pedidos",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }]
          }
        ],
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
