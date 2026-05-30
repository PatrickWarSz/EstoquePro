import { Package2, Clock, AlertTriangle, ArrowRight, ChevronRight, ChevronLeft } from "lucide-react";
import { useStockStore } from "@/lib/stock-store";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { pluralizeUnit } from "@/lib/units";

const STORAGE_KEY = "pending-panel-collapsed";

export function PendingOrdersPanel() {
  const { orders, suppliers } = useStockStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const pending = (orders || [])
    .filter((o) => o.deliveryStatus === "Entrega Incompleta")
    .sort((a, b) => {
      const aDate = a.expectedDate ? new Date(a.expectedDate).getTime() : Infinity;
      const bDate = b.expectedDate ? new Date(b.expectedDate).getTime() : Infinity;
      return aDate - bDate;
    })
    .slice(0, 8);

  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.name || "Fornecedor";

  if (collapsed) {
    return (
      <aside className="hidden xl:flex w-10 shrink-0 flex-col items-center border-l border-border bg-card/40">
        <button
          onClick={() => setCollapsed(false)}
          className="mt-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Expandir pedidos pendentes"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="mt-2 flex flex-col items-center gap-2">
          <Package2 className="h-4 w-4 text-muted-foreground" />
          {pending.length > 0 && (
            <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              {pending.length}
            </span>
          )}
        </div>
        <div
          className="mt-3 [writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Pedidos pendentes
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden xl:flex w-80 shrink-0 flex-col border-l border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Pedidos pendentes</h3>
          <p className="text-xs text-muted-foreground">
            {pending.length} aguardando {pending.length === 1 ? "entrega" : "entregas"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/pedidos")}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Ver todos"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Recolher painel"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-3">
              <Package2 className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm font-medium">Tudo em dia!</p>
            <p className="text-xs text-muted-foreground">
              Nenhum pedido pendente
            </p>
          </div>
        ) : (
          pending.map((o) => {
            const isLate = o.deadlineStatus === "Pedido Atrasado";
            const remaining = o.quantityOrdered - o.quantityDelivered;
            return (
              <button
                key={o.id}
                onClick={() => navigate("/pedidos")}
                className="w-full text-left rounded-lg border border-border bg-background p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isLate
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {isLate ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {isLate ? "Atrasado" : "Pendente"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {o.expectedDate
                      ? new Date(o.expectedDate).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug line-clamp-1">
                  {o.productDescription}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {supplierName(o.supplierId)}
                </p>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {o.quantityDelivered}/{o.quantityOrdered} {pluralizeUnit(o.quantityOrdered, o.unit, { short: true })}
                  </span>
                  <span className="font-semibold text-primary">
                    {remaining} restantes
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
