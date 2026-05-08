import { History as HistoryIcon, ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useStockStore } from "@/lib/stock-store";
import { useMemo } from "react";

export default function HistoricoPage() {
  const { categories } = useStockStore();

  const entries = useMemo(() => {
    const arr: { itemName: string; categoryName: string; type: string; quantity: number; date: string; newTotal: number; note?: string; operatorName?: string }[] = [];
    (categories || []).forEach((c) => {
      c.items.forEach((it) => {
        it.history.forEach((h) => arr.push({ itemName: it.name, categoryName: c.name, ...h }));
      });
    });
    return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [categories]);

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Histórico Geral</h2>
          <p className="text-sm text-muted-foreground">{entries.length} movimentações registradas</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4"><HistoryIcon className="h-7 w-7 text-muted-foreground" /></div>
          <p className="text-base font-semibold">Nenhuma movimentação registrada</p>
          <p className="mt-1 text-sm text-muted-foreground">Movimentações de estoque aparecerão aqui</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Categoria</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Operador</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Qtd</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.date).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 font-medium">{e.itemName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.categoryName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.operatorName || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.type === "entrada" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                        {e.type === "entrada" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{e.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{e.newTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
