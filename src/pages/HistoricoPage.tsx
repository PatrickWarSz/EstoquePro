import { History as HistoryIcon, ArrowDown, ArrowUp, Search, Download, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStockStore } from "@/lib/stock-store";
import { useMemo, useState } from "react";

interface Entry {
  itemName: string;
  categoryName: string;
  type: "entrada" | "saida";
  quantity: number;
  date: string;
  newTotal: number;
  note?: string;
  operatorName?: string;
  orderId?: string;
  unit?: string;
}

export default function HistoricoPage() {
  const { categories } = useStockStore();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "entrada" | "saida">("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allEntries = useMemo<Entry[]>(() => {
    const arr: Entry[] = [];
    (categories || []).forEach((c) => {
      c.items.forEach((it) => {
        it.history.forEach((h) =>
          arr.push({
            itemName: it.name,
            categoryName: c.name,
            unit: it.unit,
            ...h,
          })
        );
      });
    });
    return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [categories]);

  const operators = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((e) => e.operatorName && set.add(e.operatorName));
    return Array.from(set).sort();
  }, [allEntries]);

  const categoryNames = useMemo(() => {
    return (categories || []).map((c) => c.name).sort();
  }, [categories]);

  const filtered = useMemo(() => {
    return allEntries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (operatorFilter !== "all" && (e.operatorName || "—") !== operatorFilter) return false;
      if (categoryFilter !== "all" && e.categoryName !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.itemName} ${e.categoryName} ${e.note || ""} ${e.operatorName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const d = new Date(e.date);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [allEntries, search, typeFilter, operatorFilter, categoryFilter, dateFrom, dateTo]);

  const summary = useMemo(() => {
    let entradas = 0, saidas = 0, qtdEntrada = 0, qtdSaida = 0;
    filtered.forEach((e) => {
      if (e.type === "entrada") { entradas++; qtdEntrada += e.quantity; }
      else { saidas++; qtdSaida += e.quantity; }
    });
    return { entradas, saidas, qtdEntrada, qtdSaida };
  }, [filtered]);

  const hasFilters = !!(search || typeFilter !== "all" || operatorFilter !== "all" || categoryFilter !== "all" || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch(""); setTypeFilter("all"); setOperatorFilter("all");
    setCategoryFilter("all"); setDateFrom(""); setDateTo("");
  };

  const exportCSV = () => {
    const headers = ["Data", "Item", "Categoria", "Operador", "Tipo", "Quantidade", "Unidade", "Saldo", "Observação"];
    const rows = filtered.map((e) => [
      new Date(e.date).toLocaleString("pt-BR"),
      e.itemName,
      e.categoryName,
      e.operatorName || "",
      e.type,
      String(e.quantity),
      e.unit || "",
      String(e.newTotal),
      (e.note || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Histórico Geral</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} de {allEntries.length} movimentações
            {hasFilters && " (filtradas)"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar item, categoria, operador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger><SelectValue placeholder="Operador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os operadores</SelectItem>
              {operators.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 sm:col-span-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">De</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Até</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          {hasFilters && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 w-full">
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>

        {/* Resumo dos filtros */}
        <div className="mt-3 flex flex-wrap gap-3 border-t pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-success" />
            <strong className="text-foreground">{summary.entradas}</strong> entradas
            <span className="font-mono">(+{summary.qtdEntrada.toLocaleString("pt-BR")})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-destructive" />
            <strong className="text-foreground">{summary.saidas}</strong> saídas
            <span className="font-mono">(-{summary.qtdSaida.toLocaleString("pt-BR")})</span>
          </span>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">
            {hasFilters ? "Nenhuma movimentação encontrada" : "Nenhuma movimentação registrada"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters ? "Tente ajustar os filtros" : "Movimentações de estoque aparecerão aqui"}
          </p>
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
                {filtered.map((e, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.date).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{e.itemName}</p>
                      {e.note && <p className="text-[11px] text-muted-foreground mt-0.5">{e.note}</p>}
                    </td>
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
