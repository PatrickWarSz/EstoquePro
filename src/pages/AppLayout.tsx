import { Outlet, Link, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PendingOrdersPanel } from "@/components/layout/PendingOrdersPanel";
import { useEffect } from "react";
import { useStockStore } from "@/lib/stock-store";
import { useAuthStore } from "@/lib/auth-store";
import { ScanLine, Lock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const initialize = useStockStore((s) => s.initialize);
  const fetchEmployees = useAuthStore((s) => s.fetchEmployees);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);
  
  // Pegamos os valores brutos para diagnosticar e controlar a tela
  const { subscriptionStatus, expiryDate, workspaceId, asaasPortalUrl } = useAuthStore();
  
  const location = useLocation();
  const onScanner = location.pathname.startsWith("/app/scanner");
  const isMobile = useIsMobile();

  useEffect(() => {
  if (initialize) initialize();
  if (fetchEmployees) fetchEmployees();
  if (typeof refreshSubscription === 'function') refreshSubscription();

  const interval = setInterval(() => {
    if (initialize) initialize();
  }, 30000)

  return () => clearInterval(interval)
}, [])

  // LÓGICA DO KILL SWITCH BLINDADA (Trial e Assinantes)
  const isExpired = () => {
    // Se não houver data, por segurança, não bloqueamos (evita erro em novos cadastros)
    if (!expiryDate) return false;

    const now = new Date();
    const expiry = new Date(expiryDate);

    // 1. REGRA DE OURO: Se a data de hoje passou da data de vencimento, BLOQUEIA.
    // Isso vale para quem está em teste e para quem é assinante mensal.
    if (expiry < now) return true;

    // 2. REGRA COMPLEMENTAR: Se você cancelou o cara manualmente no seu painel
    if (subscriptionStatus === 'canceled') return true;

    // Caso contrário, está tudo em dia.
    return false;
  };

  const locked = isExpired();
  const isConfigPage = location.pathname.includes("/app/configuracoes");

  if (locked && !isConfigPage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10 text-destructive shadow-sm">
          <Lock className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Acesso Suspenso</h1>
        
        {subscriptionStatus === 'trialing' ? (
          <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
            Seu período de avaliação gratuita do <strong>Estoque PRO</strong> chegou ao fim. 
            Assine agora para continuar utilizando todas as funcionalidades.
          </p>
        ) : (
          <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
            Identificamos uma pendência na sua assinatura do <strong>Estoque PRO</strong>. 
            Regularize seu pagamento para restaurar o acesso imediato ao sistema.
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          {/* Se ele estiver no trial, a gente força ele a ir nas configurações escolher o plano */}
          {subscriptionStatus === 'trialing' && (
            <Button asChild size="lg" className="font-bold shadow-md w-full sm:w-auto">
              <Link to="/app/configuracoes">Escolher Meu Plano</Link>
            </Button>
          )}

          {/* Cliente Assinante Atrasado -> Vai direto pro cofre do Asaas dele */}
          {subscriptionStatus !== 'trialing' && (
            <Button size="lg" className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md w-full sm:w-auto" onClick={() => window.open(asaasPortalUrl || "https://www.asaas.com", "_blank")}>
              Acessar Portal Financeiro
            </Button>
          )}
          
          <Button variant="outline" size="lg" onClick={() => window.open("https://wa.me/5532935005786", "_blank")} className="w-full sm:w-auto">
            Falar com o Suporte
          </Button>
        </div>
        <p className="mt-12 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest opacity-60">Powered by VEXO | software & solutions</p>
      </div>
    );
  }

 return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="flex min-h-[100svh] w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">

          {subscriptionStatus === 'trialing' && !locked && !isConfigPage && (() => {
  const days = expiryDate ? Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0
  return days <= 5 && days > 0 ? (
    <div className="bg-warning text-warning-foreground px-4 py-2 text-center text-sm font-medium flex flex-wrap items-center justify-center gap-2 shadow-md z-50 relative">
      🚀 Seu acesso gratuito expira em <strong>{days} dia{days !== 1 ? 's' : ''}</strong> — Assine agora para não perder seu controle de estoque.
      <Button asChild variant="outline" size="sm" className="h-7 text-xs ml-2 text-foreground hover:bg-muted">
        <Link to="/app/configuracoes">Assinar Agora</Link>
      </Button>
    </div>
  ) : null
})()}

          {/* A FAIXA VERMELHA DO AVISO DE ATRASO (Opção 2) */}
          {subscriptionStatus === 'past_due' && !locked && !isConfigPage && (
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex flex-wrap items-center justify-center gap-2 shadow-md z-50 relative">
              ⚠️ Sua última fatura está vencida. Regularize o pagamento para evitar o bloqueio do sistema.
              <Button asChild variant="outline" size="sm" className="h-7 text-xs ml-2 text-foreground hover:bg-muted">
                <Link to="/app/configuracoes">Pagar Agora</Link>
              </Button>
            </div>
          )}

          <TopBar />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 overflow-y-auto safe-px pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0">
              <Outlet />
            </main>
            {!locked && <PendingOrdersPanel />}
          </div>
        </div>
        {!onScanner && !locked && (
          <Link
            to="/app/scanner"
            aria-label="Abrir scanner QR"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95 hover:bg-primary/90 md:hidden"
          >
            <ScanLine className="h-6 w-6" />
          </Link>
        )}
      </div>
    </SidebarProvider>
  );
}