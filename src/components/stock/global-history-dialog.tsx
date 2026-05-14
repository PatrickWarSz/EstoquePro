
import { useState, useMemo } from "react"
import { ArrowDown, ArrowUp, Calendar, Package, Search, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStockStore } from "@/lib/stock-store"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface GlobalHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface HistoryEntryWithContext {
  itemName: string
  categoryName: string
  type: "entrada" | "saida"
  quantity: number
  date: string
  newTotal: number
  unit: string
  note?: string
  orderId?: string
  operatorName?: string
}

export function GlobalHistoryDialog({ open, onOpenChange }: GlobalHistoryDialogProps) {
  const { categories, clearHistory } = useStockStore()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "entrada" | "saida">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const allHistory = useMemo(() => {
    const entries: HistoryEntryWithContext[] = []
    ;(categories || []).forEach((category) => {
      category.items.forEach((item) => {
        item.history.forEach((entry) => {
          entries.push({
            itemName: item.name,
            categoryName: category.name,
            type: entry.type,
            quantity: entry.quantity,
            date: entry.date,
            newTotal: entry.newTotal,
            unit: item.unit,
            note: entry.note,
            orderId: entry.orderId,
            operatorName: entry.operatorName,
          })
        })
      })
    })
    return entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [categories])

  const filteredHistory = useMemo(() => {
    return allHistory.filter((entry) => {
      const matchesSearch =
        search === "" ||
        entry.itemName.toLowerCase().includes(search.toLowerCase()) ||
        entry.categoryName.toLowerCase().includes(search.toLowerCase()) ||
        (entry.note && entry.note.toLowerCase().includes(search.toLowerCase()))

      const matchesType =
        typeFilter === "all" || entry.type === typeFilter

      const entryDate = new Date(entry.date)
      const matchesFrom = !dateFrom || entryDate >= new Date(dateFrom)
      const matchesTo =
        !dateTo || entryDate <= new Date(dateTo + "T23:59:59")

      return matchesSearch && matchesType && matchesFrom && matchesTo
    })
  }, [allHistory, search, typeFilter, dateFrom, dateTo])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const hasFilters = search || typeFilter !== "all" || dateFrom || dateTo

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Histórico Geral de Movimentações
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {/* Search + type filter */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar item, categoria ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(v) =>
                  setTypeFilter(v as "all" | "entrada" | "saida")
                }
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entrada">Entradas</SelectItem>
                  <SelectItem value="saida">Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range filter */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-muted-foreground shrink-0">
                Filtrar por data:
              </span>
              <div className="flex gap-2 flex-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1"
                  placeholder="De"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1"
                  placeholder="Até"
                />
                {(dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 h-9 shrink-0"
                    onClick={() => { setDateFrom(""); setDateTo("") }}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>

            {/* List */}
            <ScrollArea className="h-[380px] rounded-lg border">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Package className="mb-2 h-10 w-10 opacity-30" />
                  <p className="text-sm">
                    {hasFilters
                      ? "Nenhuma movimentação encontrada com esses filtros"
                      : "Nenhuma movimentação registrada ainda"}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredHistory.map((entry, index) => (
                    <div
                      key={`${entry.itemName}-${entry.date}-${index}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      {/* Icon — ArrowUp = entrada (stock goes up ↑), ArrowDown = saída */}
                      <div
                        className={cn(
                          "mt-0.5 rounded-full p-1.5 shrink-0",
                          entry.type === "entrada"
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {entry.type === "entrada" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {entry.itemName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.categoryName}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">
                            {entry.note}
                          </p>
                        )}
                        {entry.operatorName && (
                          <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                            por {entry.operatorName}
                          </p>
                        )}
                        {entry.orderId && (
                          <p className="text-xs text-primary mt-0.5">
                            Via pedido #{entry.orderId.slice(-6).toUpperCase()}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={cn(
                            "font-mono font-semibold text-sm",
                            entry.type === "entrada"
                              ? "text-success"
                              : "text-destructive"
                          )}
                        >
                          {entry.type === "entrada" ? "+" : "-"}
                          {entry.quantity.toLocaleString("pt-BR")} {entry.unit}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Saldo: {entry.newTotal.toLocaleString("pt-BR")}
                        </p>
                      </div>

                      <div className="text-right text-xs text-muted-foreground whitespace-nowrap shrink-0 hidden sm:block">
                        {formatDate(entry.date)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filteredHistory.length} movimentaç
                {filteredHistory.length !== 1 ? "ões" : "ão"} encontrada
                {filteredHistory.length !== 1 ? "s" : ""}
              </span>
              {hasFilters && (
                <button
                  className="hover:text-foreground transition-colors"
                  onClick={() => {
                    setSearch("")
                    setTypeFilter("all")
                    setDateFrom("")
                    setDateTo("")
                  }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear history confirmation */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá permanentemente todas as movimentações de todos os
              itens. Os saldos atuais NÃO serão alterados. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                clearHistory()
                setClearConfirmOpen(false)
                toast.success("Histórico limpo com sucesso")
              }}
            >
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
