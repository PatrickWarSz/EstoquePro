import { Outlet, Link, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PendingOrdersPanel } from "@/components/layout/PendingOrdersPanel";
import { useEffect } from "react";
import { useStockStore } from "@/lib/stock-store";
import { useAuthStore } from "@/lib/auth-store";
import { ScanLine } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function AppLayout() {
  const initialize = useStockStore((s) => s.initialize);
  const fetchEmployees = useAuthStore((s) => s.fetchEmployees); // NOVA LINHA
  const location = useLocation();
  const onScanner = location.pathname.startsWith("/app/scanner");
  const isMobile = useIsMobile();

  useEffect(() => {
    initialize();
    fetchEmployees(); // AGORA A EQUIPE É CARREGADA DA NUVEM AO ABRIR O SISTEMA
  }, [initialize, fetchEmployees]);

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="flex min-h-[100svh] w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 overflow-y-auto safe-px pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0">
              <Outlet />
            </main>
            <PendingOrdersPanel />
          </div>
        </div>
        {!onScanner && (
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
