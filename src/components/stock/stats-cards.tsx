
import { Package, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react"
import { useStockStore } from "@/lib/stock-store"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

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

  const cards: Array<{
    id: StatusFilter
    label: string
    value: number
    icon: typeof Package
    color: string
    ringColor: string
    hoverBg: string
  }> = [
    { id: "all", label: "Total", value: stats.total, icon: Package, color: "text-foreground", ringColor: "ring-foreground/30", hoverBg: "hover:bg-muted/60" },
    { id: "garantido", label: "Garantido", value: stats.garantido, icon: CheckCircle2, color: "text-success", ringColor: "ring-success/40", hoverBg: "hover:bg-success/5" },
    { id: "baixo", label: "Baixo", value: stats.baixo, icon: AlertTriangle, color: "text-warning", ringColor: "ring-warning/40", hoverBg: "hover:bg-warning/5" },
    { id: "zerado", label: "Zerado", value: stats.zerado, icon: XCircle, color: "text-destructive", ringColor: "ring-destructive/40", hoverBg: "hover:bg-destructive/5" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(({ id, label, value, icon: Icon, color, ringColor, hoverBg }) => {
        const clickable = isClickable && id !== "all"
        const active = activeFilter === id && id !== "all"
        return (
          <Card
            key={id}
            onClick={clickable ? () => handleClick(id) : undefined}
            className={cn(
              "p-4 py-3 flex items-center gap-3 transition-colors",
              clickable && cn("cursor-pointer", hoverBg),
              active && cn("ring-2", ringColor)
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", color)} />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
