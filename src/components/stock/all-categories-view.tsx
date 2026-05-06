
import { useState, useMemo } from "react"
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Package,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useStockStore } from "@/lib/stock-store"
import { StockItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type StatusFilter = "all" | "garantido" | "baixo" | "zerado"

interface AllCategoriesViewProps {
  statusFilter?: StatusFilter
  onClearFilter?: () => void
}

export function AllCategoriesView({ statusFilter = "all", onClearFilter }: AllCategoriesViewProps) {
  const { categories, updateItemQuantity, setSelectedCategory } = useStockStore()
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [movementDialog, setMovementDialog] = useState<{
    item: StockItem
    categoryId: string
    type: "entrada" | "saida"
  } | null>(null)
  const [quantity, setQuantity] = useState("")
  const [note, setNote] = useState("")

  const getStatus = (item: StockItem) => {
    if (item.quantity === 0) return "zerado"
    if (item.quantity <= item.minQuantity) return "baixo"
    return "garantido"
  }

  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => {
        const items = cat.items.filter((item) => {
          const matchesSearch =
            search === "" ||
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            cat.name.toLowerCase().includes(search.toLowerCase())
          const matchesStatus =
            statusFilter === "all" || getStatus(item) === statusFilter
          return matchesSearch && matchesStatus
        })
        return { ...cat, items }
      })
      .filter((cat) => cat.items.length > 0)
  }, [categories, search, statusFilter])

  const totalFiltered = filteredCategories.reduce(
    (acc, cat) => acc + cat.items.length,
    0
  )

  const toggleCollapse = (catId: string) => {
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }))
  }

  const handleMovement = () => {
    if (!movementDialog || !quantity) return
    const qty = parseInt(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantidade inválida")
      return
    }
    const newQuantity =
      movementDialog.type === "entrada"
        ? movementDialog.item.quantity + qty
        : Math.max(0, movementDialog.item.quantity - qty)

    updateItemQuantity(
      movementDialog.categoryId,
      movementDialog.item.id,
      newQuantity,
      movementDialog.type,
      qty,
      note.trim() || undefined
    )
    toast.success(
      `${movementDialog.type === "entrada" ? "Entrada" : "Saída"} de ${qty} ${movementDialog.item.unit} registrada`
    )
    setMovementDialog(null)
    setQuantity("")
    setNote("")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "garantido":
        return (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[10px] px-1.5 py-0">
            OK
          </Badge>
        )
      case "baixo":
        return (
          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning text-[10px] px-1.5 py-0">
            Baixo
          </Badge>
        )
      case "zerado":
        return (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px] px-1.5 py-0">
            Zerado
          </Badge>
        )
    }
  }

  const getProgressPercent = (item: StockItem) => {
    if (item.minQuantity === 0) return item.quantity > 0 ? 100 : 0
    return Math.min(100, Math.round((item.quantity / (item.minQuantity * 2)) * 100))
  }

  if (categories.length === 0) {
    return (
      <Card className="flex h-64 flex-col items-center justify-center gap-3">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">Nenhuma categoria criada ainda</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search + filter info bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar em todas as categorias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {statusFilter !== "all" && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              statusFilter === "baixo" && "bg-warning/10 text-warning",
              statusFilter === "zerado" && "bg-destructive/10 text-destructive",
              statusFilter === "garantido" && "bg-success/10 text-success",
            )}>
              Filtro: {statusFilter}
              {onClearFilter && (
                <button onClick={onClearFilter} className="ml-1 hover:opacity-70">✕</button>
              )}
            </span>
          )}
          <span>{totalFiltered} iten{totalFiltered !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Category sections */}
      {filteredCategories.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-2">
          <Package className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCategories.map((cat) => {
            const isCollapsed = collapsed[cat.id]
            const lowCount = cat.items.filter(i => getStatus(i) === "baixo").length
            const zeroCount = cat.items.filter(i => getStatus(i) === "zerado").length

            return (
              <Card key={cat.id} className="overflow-hidden py-0">
                {/* Category header */}
                <button
                  onClick={() => toggleCollapse(cat.id)}
                  className="flex w-full items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 text-left hover:bg-muted/40 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold text-xs sm:text-sm tracking-wide uppercase text-muted-foreground">
                    {cat.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    {zeroCount > 0 && (
                      <span className="text-[10px] sm:text-xs text-destructive font-medium">{zeroCount} zerado</span>
                    )}
                    {lowCount > 0 && (
                      <span className="text-[10px] sm:text-xs text-warning font-medium">{lowCount} baixo</span>
                    )}
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {cat.items.length}
                    </span>
                  </div>
                </button>

                {/* Items table */}
                {!isCollapsed && (
                  <div className="border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30">
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Item
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                              Qtd / Mín
                            </th>
                            <th className="hidden sm:table-cell px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-36">
                              Nível
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Status
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {cat.items.map((item) => {
                            const status = getStatus(item)
                            const pct = getProgressPercent(item)
                            return (
                              <tr
                                key={item.id}
                                className={cn(
                                  "transition-colors hover:bg-muted/30",
                                  status === "zerado" && "bg-destructive/[0.03]",
                                  status === "baixo" && "bg-warning/[0.03]",
                                )}
                              >
                                <td className="px-4 py-2.5 font-medium max-w-[200px] lg:max-w-xs truncate">
                                  {item.name}
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                                  <span className={cn(
                                    "font-semibold text-sm",
                                    status === "zerado" && "text-destructive",
                                    status === "baixo" && "text-warning",
                                  )}>
                                    {item.quantity.toLocaleString("pt-BR")}
                                  </span>
                                  <span className="text-muted-foreground ml-1">{item.unit}</span>
                                  <span className="text-muted-foreground/50 mx-1">/</span>
                                  <span className="text-muted-foreground">
                                    {item.minQuantity.toLocaleString("pt-BR")}
                                  </span>
                                </td>
                                <td className="hidden sm:table-cell px-4 py-2.5 w-36">
                                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        status === "zerado" && "bg-destructive",
                                        status === "baixo" && "bg-warning",
                                        status === "garantido" && "bg-success",
                                      )}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {getStatusBadge(status)}
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Entrada"
                                    className="h-9 w-9 sm:h-7 sm:w-7 text-success hover:bg-success/10 hover:text-success"
                                    onClick={() =>
                                      setMovementDialog({ item, categoryId: cat.id, type: "entrada" })
                                    }
                                  >
                                    <ArrowUpCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Saída"
                                    className="h-9 w-9 sm:h-7 sm:w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() =>
                                      setMovementDialog({ item, categoryId: cat.id, type: "saida" })
                                    }
                                  >
                                    <ArrowDownCircle className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Movement Dialog */}
      <Dialog
        open={movementDialog !== null}
        onOpenChange={() => { setMovementDialog(null); setQuantity(""); setNote("") }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {movementDialog?.type === "entrada" ? (
                <ArrowUpCircle className="h-5 w-5 text-success" />
              ) : (
                <ArrowDownCircle className="h-5 w-5 text-destructive" />
              )}
              {movementDialog?.type === "entrada" ? "Registrar Entrada" : "Registrar Saída"}
            </DialogTitle>
            <DialogDescription>
              {movementDialog?.item.name} — Estoque atual:{" "}
              <strong>
                {movementDialog?.item.quantity} {movementDialog?.item.unit}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="qty-all">Quantidade</Label>
            <Input
              id="qty-all"
              type="number"
              min="1"
              placeholder="Digite a quantidade"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-2"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleMovement()}
            />
            <div className="mt-4 space-y-2">
              <Label htmlFor="note-all">
                Descrição / Observação{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="note-all"
                placeholder="Ex: NF 1234, chegada do pedido, ajuste de inventário..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMovementDialog(null); setQuantity("") }}>
              Cancelar
            </Button>
            <Button
              onClick={handleMovement}
              className={
                movementDialog?.type === "entrada"
                  ? "bg-success hover:bg-success/90"
                  : "bg-destructive hover:bg-destructive/90"
              }
            >
              Confirmar {movementDialog?.type === "entrada" ? "Entrada" : "Saída"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
