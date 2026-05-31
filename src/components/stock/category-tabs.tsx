
import { Settings, ChevronDown, AlertTriangle, XCircle } from "lucide-react"
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

interface CategoryTabsProps {
  onEditCategories: () => void
}

export function CategoryTabs({ onEditCategories }: CategoryTabsProps) {
  const { categories, selectedCategoryId, setSelectedCategory } = useStockStore()

  const safeCategories = categories || []

  if (safeCategories.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 text-sm text-muted-foreground">
          Nenhuma categoria criada ainda.
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onEditCategories}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Criar Categoria
        </Button>
      </div>
    )
  }

  const selectedCategory = safeCategories.find((c) => c.id === selectedCategoryId)
  const lowCount = selectedCategory?.items.filter(
    (item) => item.quantity <= item.minQuantity && item.quantity > 0
  ).length || 0
  const zeroCount = selectedCategory?.items.filter(
    (item) => item.quantity === 0
  ).length || 0

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <Select
        value={selectedCategoryId || undefined}
        onValueChange={setSelectedCategory}
      >
        <SelectTrigger className="w-full min-w-0 sm:max-w-xs">
          <SelectValue placeholder="Selecione uma categoria">
            <span className="block truncate">
              {selectedCategory?.name}
              <span className="ml-1 text-xs text-muted-foreground">
                ({selectedCategory?.items.length ?? 0} {(selectedCategory?.items.length ?? 0) === 1 ? "item" : "itens"})
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {safeCategories.map((category) => {
            const catLowCount = category.items.filter(
              (item) => item.quantity <= item.minQuantity && item.quantity > 0
            ).length
            const catZeroCount = category.items.filter(
              (item) => item.quantity === 0
            ).length

            return (
              <SelectItem key={category.id} value={category.id}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{category.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({category.items.length} {category.items.length === 1 ? "item" : "itens"})
                  </span>
                  {catZeroCount > 0 && (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  {catLowCount > 0 && catZeroCount === 0 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  )}
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {selectedCategory && (
        <div className="flex items-center gap-2 text-sm">
          {zeroCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              <XCircle className="h-3 w-3" />
              {zeroCount} zerado
            </span>
          )}
          {lowCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {lowCount} baixo
            </span>
          )}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onEditCategories}
        className="ml-auto gap-2 shrink-0"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Gerenciar Categorias</span>
        <span className="sm:hidden">Gerenciar</span>
      </Button>
    </div>
  )
}
