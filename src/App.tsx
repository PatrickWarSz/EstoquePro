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
import LoginPage from "./pages/LoginPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import EmployeeHistoryPage from "./pages/EmployeeHistoryPage";
import { RequireAuth } from "@/components/auth/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Navigate to="/app/estoque" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/app" element={<Navigate to="/app/estoque" replace />} />
              <Route path="/app/estoque" element={<RequireAuth module="estoque"><EstoquePage /></RequireAuth>} />
              <Route path="/app/pedidos" element={<RequireAuth module="pedidos"><PedidosPage /></RequireAuth>} />
              <Route path="/app/fornecedores" element={<RequireAuth module="fornecedores"><FornecedoresPage /></RequireAuth>} />
              <Route path="/app/historico" element={<RequireAuth module="historico"><HistoricoPage /></RequireAuth>} />
              <Route path="/app/scanner" element={<RequireAuth module="scanner"><ScannerPage /></RequireAuth>} />
              <Route path="/app/etiquetas" element={<RequireAuth module="etiquetas"><EtiquetasPage /></RequireAuth>} />
              <Route path="/app/configuracoes" element={<RequireAuth module="configuracoes"><ConfiguracoesPage /></RequireAuth>} />
              <Route path="/app/funcionarios" element={<RequireAuth adminOnly><FuncionariosPage /></RequireAuth>} />
              <Route path="/app/funcionarios/:id/historico" element={<RequireAuth adminOnly><EmployeeHistoryPage /></RequireAuth>} />
              {/* compat com URLs antigas */}
              <Route path="/estoque" element={<Navigate to="/app/estoque" replace />} />
              <Route path="/pedidos" element={<Navigate to="/app/pedidos" replace />} />
              <Route path="/fornecedores" element={<Navigate to="/app/fornecedores" replace />} />
              <Route path="/historico" element={<Navigate to="/app/historico" replace />} />
              <Route path="/configuracoes" element={<Navigate to="/app/configuracoes" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
