import { Search, Moon, Sun, AlertTriangle, LogOut, User as UserIcon, Shield, ArrowLeft, Wifi, WifiOff, CloudUpload } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useStockStore } from "@/lib/stock-store";
import { useAuthStore } from "@/lib/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { countPendingMovements } from "@/lib/idb-queue";

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const { categories } = useStockStore();
  const currentUserId = useAuthStore((s) => s.currentUserId);
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser);
  const user = getCurrentUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");

  // Status online/offline + contagem de operações pendentes na fila
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const onUp = () => setIsOnline(true);
    const onDown = () => setIsOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    const refresh = async () => {
      try { setPendingCount(await countPendingMovements()); } catch { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      clearInterval(id);
    };
  }, []);

  const lowOrZero = useMemo(() => {
    let n = 0;
    (categories || []).forEach((c) =>
      c.items.forEach((i) => {
        if (i.quantity === 0 || i.quantity <= i.minQuantity) n++;
      }),
    );
    return n;
  }, [categories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/app/estoque?q=${encodeURIComponent(q)}`);
  };

  // Rotas "raiz" do app — não mostra botão voltar nelas
  const rootRoutes = ["/app/estoque", "/app", "/app/"];
  const isRoot = rootRoutes.includes(location.pathname);

  return (
    <header
      className="sticky top-0 z-40 flex w-full items-center gap-2 border-b border-border bg-background/95 px-3 sm:px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        height: "calc(3.5rem + env(safe-area-inset-top))",
      }}
    >
      <SidebarTrigger className="h-9 w-9 shrink-0" />

      {!isRoot && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/app/estoque");
          }}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      <form onSubmit={handleSearch} className="relative hidden sm:block flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item no estoque..."
          className="h-9 pl-9 pr-16 bg-muted/40 border-border"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </form>

      {/* Mobile: brand label centered, search lives inside Estoque page */}
      <div className="sm:hidden flex-1 truncate font-display text-sm font-semibold tracking-tight">
        EstoquePro
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Status de conexão / sincronização */}
        {!isOnline ? (
          <span
            className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 sm:px-3 py-1 text-xs font-medium text-destructive"
            title="Sem internet — o app continua funcionando e sincroniza quando conectar"
          >
            <WifiOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Offline</span>
            {pendingCount > 0 && <span>· {pendingCount}</span>}
          </span>
        ) : pendingCount > 0 ? (
          <span
            className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 sm:px-3 py-1 text-xs font-medium text-warning"
            title={`${pendingCount} operação(ões) sendo sincronizada(s)`}
          >
            <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
            <span>{pendingCount}</span>
          </span>
        ) : null}

        {lowOrZero > 0 && (
          <button
            onClick={() => navigate("/estoque")}
            className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 sm:px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors"
            aria-label={`${lowOrZero} alertas`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{lowOrZero}</span>
            <span className="hidden sm:inline">{lowOrZero === 1 ? "alerta" : "alertas"}</span>
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                  {user.kind === "admin" ? <Shield className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden text-xs font-medium md:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{user.name}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  @{user.username} · {user.kind === "admin" ? "Administrador" : user.isAdmin ? "Co-Admin" : "Operador"}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(user.kind === "admin" || user.isAdmin) && (
                <DropdownMenuItem onClick={() => navigate("/app/funcionarios")}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  Funcionários
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
