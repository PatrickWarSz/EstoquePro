import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import AppLayout from "./pages/AppLayout";
import EstoquePage from "./pages/EstoquePage";
import PedidosPage from "./pages/PedidosPage";
import FornecedoresPage from "./pages/FornecedoresPage";
import HistoricoPage from "./pages/HistoricoPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import ScannerPage from "./pages/ScannerPage";
import EtiquetasPage from "./pages/EtiquetasPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import EmployeeHistoryPage from "./pages/EmployeeHistoryPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PwaUpdater } from "@/components/pwa-updater";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PwaUpdater />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

// Componente auxiliar para redirect externo via React Router
function ExternalRedirect({ to }: { to: string }) {
  window.location.replace(to);
  return null;
}

export default App;