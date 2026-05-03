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
            <Route element={<AppLayout />}>
              <Route path="/app" element={<Navigate to="/app/estoque" replace />} />
              <Route path="/app/estoque" element={<EstoquePage />} />
              <Route path="/app/pedidos" element={<PedidosPage />} />
              <Route path="/app/fornecedores" element={<FornecedoresPage />} />
              <Route path="/app/historico" element={<HistoricoPage />} />
              <Route path="/app/configuracoes" element={<ConfiguracoesPage />} />
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
