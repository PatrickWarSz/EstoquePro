import { Search, Moon, Sun, AlertTriangle, LogOut, User as UserIcon, Shield, ArrowLeft, WifiOff, CloudUpload, RefreshCw, Trash2 } from "lucide-react";
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
import { countPendingMovementsFor, getPendingMovements, removePendingMovement } from "@/lib/idb-queue";
import { countOps, listOps, removeOp, type QueuedOp } from "@/lib/op-queue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [queueOpen, setQueueOpen] = useState(false);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

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
      try {
        const scope = { workspaceId, ownerUserId: currentUserId, includeLegacy: false };
        const [m, o] = await Promise.all([
          countPendingMovementsFor(scope).catch(() => 0),
          countOps(scope).catch(() => 0),
        ]);
        setPendingCount(m + o);
      } catch { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      clearInterval(id);
    };
  }, [workspaceId, currentUserId]);

  const refreshQueue = async () => {
    const scope = { workspaceId, ownerUserId: currentUserId, includeLegacy: false };
    const [nextMovements, nextOps] = await Promise.all([
      getPendingMovements(scope).catch(() => []),
      listOps(scope).catch(() => []),
    ]);
    setMovements(nextMovements);
    setOps(nextOps.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setPendingCount(nextMovements.length + nextOps.length);
  };

  useEffect(() => {
    if (queueOpen) refreshQueue();
  }, [queueOpen, workspaceId, currentUserId]);

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
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 sm:px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
            title="Sem internet — o app continua funcionando e sincroniza quando conectar"
          >
            <WifiOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Offline</span>
            {pendingCount > 0 && <span>· {pendingCount}</span>}
          </button>
        ) : pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 sm:px-3 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/15"
            title={`${pendingCount} operação(ões) sendo sincronizada(s)`}
          >
            <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
            <span>{pendingCount}</span>
          </button>
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
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fila de sincronização</DialogTitle>
            <DialogDescription>
              Operações pendentes apenas desta conta. Você pode tentar sincronizar ou cancelar itens com erro.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-2"
              disabled={syncing || pendingCount === 0 || !isOnline}
              onClick={async () => {
                setSyncing(true);
                try {
                  await useStockStore.getState().syncPendingOps(true);
                  await useStockStore.getState().syncPendingMovements();
                  await refreshQueue();
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar agora
            </Button>
            <Button size="sm" variant="outline" onClick={refreshQueue}>Atualizar lista</Button>
          </div>
          <ScrollArea className="max-h-[55vh] pr-2">
            <div className="space-y-3 py-1">
              {movements.length === 0 && ops.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Nenhuma operação pendente para esta conta.
                </div>
              ) : null}
              {ops.map((op) => (
                <div key={op.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{labelOp(op.type)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(op.createdAt).toLocaleString("pt-BR")}</div>
                      {op.lastError && <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{op.lastError}</div>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Cancelar operação pendente"
                      onClick={async () => { await removeOp(op.id); await refreshQueue(); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {movements.map((m) => (
                <div key={m.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">Movimentação de estoque · {m.type === "entrada" ? "Entrada" : "Saída"}</div>
                      <div className="text-xs text-muted-foreground">{Number(m.movQ).toLocaleString("pt-BR")} · {new Date(m.date).toLocaleString("pt-BR")}</div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Cancelar movimentação pendente"
                      onClick={async () => { await removePendingMovement(m.id); await refreshQueue(); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function labelOp(type: QueuedOp["type"]) {
  const labels: Record<QueuedOp["type"], string> = {
    "order.add": "Criar pedido",
    "order.update": "Atualizar pedido",
    "order.remove": "Remover pedido",
    "order.finalize": "Finalizar pedido",
    "delivery.register": "Registrar entrega",
    "delivery.update": "Atualizar entrega",
    "item.add": "Criar item",
    "item.update": "Atualizar item",
    "item.remove": "Remover item",
  };
  return labels[type] || type;
}
