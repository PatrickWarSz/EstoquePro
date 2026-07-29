import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import AppLayout from "./pages/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PwaUpdater } from "@/components/pwa-updater";
import { useAuthStore } from "@/lib/auth-store";

// Cada página vira seu próprio pedaço de JS, baixado só quando o funcionário
// navega até ela — antes, importar tudo aqui em cima forçava o bundle
// inteiro (scanner, etiquetas, funcionários, etc.) a entrar no primeiro
// carregamento do app, mesmo que a pessoa só use "Estoque" no dia a dia.
const EstoquePage = lazy(() => import("./pages/EstoquePage"));
const PedidosPage = lazy(() => import("./pages/PedidosPage"));
const FornecedoresPage = lazy(() => import("./pages/FornecedoresPage"));
const HistoricoPage = lazy(() => import("./pages/HistoricoPage"));
const ConfiguracoesPage = lazy(() => import("./pages/ConfiguracoesPage"));
const ScannerPage = lazy(() => import("./pages/ScannerPage"));
const EtiquetasPage = lazy(() => import("./pages/EtiquetasPage"));
const FuncionariosPage = lazy(() => import("./pages/FuncionariosPage"));
const EmployeeHistoryPage = lazy(() => import("./pages/EmployeeHistoryPage"));
const SomatoriosPage = lazy(() => import("./pages/SomatoriosPage"));

// Mesmo visual do spinner já usado em RequireAuth.tsx — troca de página deve
// parecer parte do mesmo app, não um estado de loading diferente.
function PageFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
    </div>
  );
}

const queryClient = new QueryClient();

const App = () => {
  const initializeFromSupabase = useAuthStore((s) => s.initializeFromSupabase);

  // SEGURANÇA: Restaurar sessão do Supabase automaticamente na montagem
  useEffect(() => {
    initializeFromSupabase();
  }, [initializeFromSupabase]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaUpdater />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
              {/* Raiz → app diretamente */}
              <Route path="/" element={<Navigate to="/app/estoque" replace />} />

              {/* Qualquer tentativa de acessar /login redireciona para o auth centralizado */}
              <Route
                path="/login"
                element={<ExternalRedirect to="https://auth.vexodev.com.br/?app=estoque" />}
              />

              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Navigate to="/app/estoque" replace />} />
                <Route path="estoque" element={<RequireAuth module="estoque"><EstoquePage /></RequireAuth>} />
                <Route path="pedidos" element={<RequireAuth module="pedidos"><PedidosPage /></RequireAuth>} />
                <Route path="fornecedores" element={<RequireAuth module="fornecedores"><FornecedoresPage /></RequireAuth>} />
                <Route path="historico" element={<RequireAuth module="historico"><HistoricoPage /></RequireAuth>} />
                <Route path="scanner" element={<RequireAuth module="scanner"><ScannerPage /></RequireAuth>} />
                <Route path="etiquetas" element={<RequireAuth module="etiquetas"><EtiquetasPage /></RequireAuth>} />
                <Route path="somatorios" element={<RequireAuth module="somatorios"><SomatoriosPage /></RequireAuth>} />
                <Route path="configuracoes" element={<RequireAuth module="configuracoes"><ConfiguracoesPage /></RequireAuth>} />
                <Route path="funcionarios" element={<RequireAuth adminOnly><FuncionariosPage /></RequireAuth>} />
                <Route path="funcionarios/:id/historico" element={<RequireAuth adminOnly><EmployeeHistoryPage /></RequireAuth>} />
              </Route>

              {/* Compat com URLs antigas */}
              <Route path="/estoque" element={<Navigate to="/app/estoque" replace />} />
              <Route path="/pedidos" element={<Navigate to="/app/pedidos" replace />} />
              <Route path="/fornecedores" element={<Navigate to="/app/fornecedores" replace />} />
              <Route path="/historico" element={<Navigate to="/app/historico" replace />} />
              <Route path="/configuracoes" element={<Navigate to="/app/configuracoes" replace />} />

              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

// Componente auxiliar para redirect externo via React Router
function ExternalRedirect({ to }: { to: string }) {
  window.location.replace(to);
  return null;
}

export default App;