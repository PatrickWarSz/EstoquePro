import { useState, useMemo, useEffect } from "react"
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Package,
  GripVertical,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useStockStore } from "@/lib/stock-store"
import { StockItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MovementDialog } from "./movement-dialog"
import { SortableList } from "@/components/ui/sortable-list"
import { pluralizeUnit } from "@/lib/units"

type StatusFilter = "all" | "garantido" | "baixo" | "zerado"

interface AllCategoriesViewProps {
  statusFilter?: StatusFilter
  onClearFilter?: () => void
  initialSearch?: string
}

export function AllCategoriesView({ statusFilter = "all", onClearFilter, initialSearch = "" }: AllCategoriesViewProps) {
  const { categories, reorderItems } = useStockStore()
  const [search, setSearch] = useState(initialSearch)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // sincroniza quando o usuário busca pelo TopBar
  useEffect(() => { setSearch(initialSearch) }, [initialSearch])
  
  // Agora usamos o estado correto para abrir nosso novo MovementDialog!
  const [movementDialog, setMovementDialog] = useState<{
    item: StockItem
    categoryId: string
    type: "entrada" | "saida"
  } | null>(null)

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
  },[categories, search, statusFilter])

  const totalFiltered = filteredCategories.reduce(
    (acc, cat) => acc + cat.items.length,
    0
  )

  const toggleCollapse = (catId: string) => {
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }))
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
          <span>{totalFiltered} {totalFiltered === 1 ? "item" : "itens"}</span>
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
                    {/* Mobile: cards (sem scroll horizontal) */}
                    <div className="md:hidden">
                      <SortableList
                        className="divide-y divide-border"
                        items={cat.items}
                        onReorder={(ids) => reorderItems(cat.id, ids)}
                        renderItem={(item, handle) => {
                          const status = getStatus(item)
                          return (
                            <div
                              className={cn(
                                "p-3",
                                status === "zerado" && "bg-destructive/5",
                                status === "baixo" && "bg-warning/5",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  ref={handle.setActivatorNodeRef}
                                  {...handle.attributes}
                                  {...handle.listeners}
                                  type="button"
                                  aria-label="Mover item"
                                  className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">{item.name}</p>
                                </div>
                                <div className={cn(
                                  "shrink-0 text-right text-sm tabular-nums font-semibold whitespace-nowrap",
                                  status === "zerado" && "text-destructive",
                                  status === "baixo" && "text-warning",
                                )}>
                                  {item.quantity.toLocaleString("pt-BR")}{" "}
                                  <span className="text-xs text-muted-foreground font-normal">
                                    {pluralizeUnit(item.quantity, item.unit, { short: true })}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 flex-1 text-success border-success/30 hover:bg-success/10"
                                  onClick={() => setMovementDialog({ item, categoryId: cat.id, type: "entrada" })}
                                >
                                  <ArrowUpCircle className="mr-1 h-4 w-4" />
                                  Entrada
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => setMovementDialog({ item, categoryId: cat.id, type: "saida" })}
                                >
                                  <ArrowDownCircle className="mr-1 h-4 w-4" />
                                  Saída
                                </Button>
                              </div>
                            </div>
                          )
                        }}
                      />
                    </div>
                    {/* Desktop / tablet: table */}
                    <div className="hidden md:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30">
                            <th className="w-8 px-2 py-2"></th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                              Material
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                              Categoria
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                              Estoque
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <SortableList
                          asTbody
                          className="divide-y divide-border"
                          items={cat.items}
                          onReorder={(ids) => reorderItems(cat.id, ids)}
                          renderItem={(item, handle) => {
                            const status = getStatus(item)
                            return (
                              <tr
                                className={cn(
                                  "transition-colors hover:bg-muted/30",
                                  status === "zerado" && "bg-destructive/5 hover:bg-destructive/10",
                                  status === "baixo" && "bg-warning/5 hover:bg-warning/10",
                                )}
                              >
                                <td className="px-2 py-2.5 w-8">
                                  <button
                                    ref={handle.setActivatorNodeRef}
                                    {...handle.attributes}
                                    {...handle.listeners}
                                    type="button"
                                    aria-label="Mover item"
                                    className="cursor-grab touch-none rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                                <td className="px-4 py-2.5 font-medium max-w-[200px] lg:max-w-xs truncate">
                                  {item.name}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground text-sm max-w-[220px] truncate">
                                  {cat.name}
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap text-sm tabular-nums">
                                  <span className={cn(
                                    "font-semibold",
                                    status === "zerado" && "text-destructive",
                                    status === "baixo" && "text-warning",
                                  )}>
                                    {item.quantity.toLocaleString("pt-BR")}
                                  </span>
                                  <span className="text-muted-foreground ml-1">
                                    {pluralizeUnit(item.quantity, item.unit)}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-success border-success/30 hover:bg-success/10 h-8"
                                      onClick={() => setMovementDialog({ item, categoryId: cat.id, type: "entrada" })}
                                    >
                                      <ArrowUpCircle className="mr-1 h-4 w-4" />
                                      <span className="hidden sm:inline">Entrada</span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8"
                                      onClick={() => setMovementDialog({ item, categoryId: cat.id, type: "saida" })}
                                    >
                                      <ArrowDownCircle className="mr-1 h-4 w-4" />
                                      <span className="hidden sm:inline">Saída</span>
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }}
                        />
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* NOVO MOVEMENT DIALOG OFICIAL IMPORTADO AQUI */}
      {movementDialog && (
        <MovementDialog
          item={movementDialog.item}
          categoryId={movementDialog.categoryId}
          type={movementDialog.type}
          open={movementDialog !== null}
          onOpenChange={(open) => !open && setMovementDialog(null)}
        />
      )}
    </div>
  )
}