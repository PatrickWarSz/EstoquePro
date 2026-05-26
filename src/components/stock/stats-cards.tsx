
import { Package, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react"
import { useStockStore } from "@/lib/stock-store"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "garantido" | "baixo" | "zerado"

interface StatsCardsProps {
  activeFilter?: StatusFilter
  onFilterChange?: (filter: StatusFilter) => void
}

export function StatsCards({ activeFilter = "all", onFilterChange }: StatsCardsProps) {
  const { categories } = useStockStore()

  const stats = (categories || []).reduce(
    (acc, category) => {
      category.items.forEach((item) => {
        acc.total++
        if (item.quantity === 0) {
          acc.zerado++
        } else if (item.quantity <= item.minQuantity) {
          acc.baixo++
        } else {
          acc.garantido++
        }
      })
      return acc
    },
    { total: 0, garantido: 0, baixo: 0, zerado: 0 }
  )

  if (stats.total === 0) return null

  const handleClick = (filter: StatusFilter) => {
    if (!onFilterChange) return
    onFilterChange(activeFilter === filter ? "all" : filter)
  }

  const isClickable = !!onFilterChange

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
      {/* Total — always shown but not a filter */}
      <div className="flex items-center gap-2 pr-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono-vexo text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="font-display text-base font-semibold text-foreground tabular-nums">{stats.total}</span>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Garantido */}
      <button
        onClick={() => handleClick("garantido")}
        disabled={!isClickable}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
          isClickable && "cursor-pointer hover:bg-success/10",
          activeFilter === "garantido" && "bg-success/15 ring-1 ring-success/30",
          !isClickable && "cursor-default"
        )}
      >
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="font-mono-vexo text-[10px] uppercase tracking-wider text-muted-foreground">Garantido</span>
        <span className="font-display text-base font-semibold text-success tabular-nums">{stats.garantido}</span>
      </button>

      <div className="h-4 w-px bg-border" />

      {/* Baixo */}
      <button
        onClick={() => handleClick("baixo")}
        disabled={!isClickable}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
          isClickable && "cursor-pointer hover:bg-warning/10",
          activeFilter === "baixo" && "bg-warning/15 ring-1 ring-warning/30",
          !isClickable && "cursor-default"
        )}
      >
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="font-mono-vexo text-[10px] uppercase tracking-wider text-muted-foreground">Baixo</span>
        <span className="font-display text-base font-semibold text-warning tabular-nums">{stats.baixo}</span>
      </button>

      <div className="h-4 w-px bg-border" />

      {/* Zerado */}
      <button
        onClick={() => handleClick("zerado")}
        disabled={!isClickable}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
          isClickable && "cursor-pointer hover:bg-destructive/10",
          activeFilter === "zerado" && "bg-destructive/15 ring-1 ring-destructive/30",
          !isClickable && "cursor-default"
        )}
      >
        <XCircle className="h-4 w-4 text-destructive" />
        <span className="font-mono-vexo text-[10px] uppercase tracking-wider text-muted-foreground">Zerado</span>
        <span className="font-display text-base font-semibold text-destructive tabular-nums">{stats.zerado}</span>
      </button>

      {isClickable && activeFilter !== "all" && (
        <>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => onFilterChange("all")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            limpar filtro ✕
          </button>
        </>
      )}
    </div>
  )
}
