import { Outlet, Link, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PendingOrdersPanel } from "@/components/layout/PendingOrdersPanel";
import { useEffect } from "react";
import { useStockStore } from "@/lib/stock-store";
import { ScanLine } from "lucide-react";

export default function AppLayout() {
  const initialize = useStockStore((s) => s.initialize);
  const location = useLocation();
  const onScanner = location.pathname.startsWith("/app/scanner");

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 overflow-y-auto">
              <Outlet />
            </main>
            <PendingOrdersPanel />
          </div>
        </div>
        {!onScanner && (
          <Link
            to="/app/scanner"
            aria-label="Abrir scanner QR"
            className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:bg-primary/90 md:hidden"
          >
            <ScanLine className="h-6 w-6" />
          </Link>
        )}
      </div>
    </SidebarProvider>
  );
}
