import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowUp, History as HistoryIcon, Search, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStockStore } from "@/lib/stock-store"
import { useAuthStore } from "@/lib/auth-store"
import { pluralizeUnit } from "@/lib/units"

export default function EmployeeHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const { employees } = useAuthStore()
  const { categories } = useStockStore()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "entrada" | "saida">("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const employee = employees.find((e) => e.id === id)

  const allEntries = useMemo(() => {
    const arr: {
      itemName: string
      categoryName: string
      type: "entrada" | "saida"
      quantity: number
      date: string
      newTotal: number
      unit: string
      note?: string
    }[] = []
    ;(categories || []).forEach((c) =>
      c.items.forEach((it) =>
        it.history.forEach((h) => {
          if (h.operatorId !== id) return
          arr.push({
            itemName: it.name,
            categoryName: c.name,
            type: h.type,
            quantity: h.quantity,
            date: h.date,
            newTotal: h.newTotal,
            unit: it.unit,
            note: h.note,
          })
        }),
      ),
    )
    return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [categories, id])

  const categoryNames = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.categoryName))).sort(),
    [allEntries],
  )

  const entries = useMemo(() => {
    return allEntries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false
      if (categoryFilter !== "all" && e.categoryName !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${e.itemName} ${e.categoryName} ${e.note || ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      const d = new Date(e.date)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false
      return true
    })
  }, [allEntries, search, typeFilter, categoryFilter, dateFrom, dateTo])

  const hasFilters = !!(search || typeFilter !== "all" || categoryFilter !== "all" || dateFrom || dateTo)
  const clearFilters = () => {
    setSearch(""); setTypeFilter("all"); setCategoryFilter("all"); setDateFrom(""); setDateTo("")
  }

  if (!employee) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-8">
        <p className="text-sm text-muted-foreground">Funcionário não encontrado.</p>
        <Button variant="outline" asChild className="mt-3 gap-1.5">
          <Link to="/app/funcionarios"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/app/funcionarios"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Histórico de {employee.name}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            @{employee.username} · {entries.length} de {allEntries.length} {allEntries.length === 1 ? "movimentação" : "movimentações"}
            {hasFilters && " (filtradas)"}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar item, categoria..."
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
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 w-full">
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">
            {hasFilters ? "Nenhuma movimentação encontrada" : "Nenhuma movimentação registrada"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters ? "Tente ajustar os filtros" : "Movimentações deste funcionário aparecerão aqui"}
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {entries.map((e, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.type === "entrada" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {e.type === "entrada" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                    {e.type}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(e.date).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold break-words leading-snug">{e.itemName}</p>
                <p className="text-xs text-muted-foreground break-words">{e.categoryName}</p>
                {e.note && <p className="mt-1 text-[11px] text-muted-foreground">{e.note}</p>}
                <div className="mt-2 flex items-center justify-between text-xs border-t pt-2">
                  <span className="font-mono">
                    <span className={e.type === "entrada" ? "text-success" : "text-destructive"}>
                      {e.type === "entrada" ? "+" : "−"}{e.quantity} {pluralizeUnit(e.quantity, e.unit, { short: true })}
                    </span>
                    <span className="text-muted-foreground"> → {e.newTotal}</span>
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Categoria</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qtd</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(e.date).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium break-words">{e.itemName}</p>
                        {e.note && <p className="text-[11px] text-muted-foreground mt-0.5">{e.note}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground break-words">{e.categoryName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.type === "entrada" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                          {e.type === "entrada" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                          {e.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                        {e.quantity} <span className="text-muted-foreground">{pluralizeUnit(e.quantity, e.unit)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{e.newTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
