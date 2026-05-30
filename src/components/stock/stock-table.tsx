
import { useMemo, useState } from "react"
import { ArrowUpCircle, ArrowDownCircle, MoreHorizontal, History, PenSquare, Trash2, GripVertical } from "lucide-react"
import { useStockStore } from "@/lib/stock-store"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MovementDialog } from "./movement-dialog"
import { EditItemDialog } from "./edit-item-dialog"
import { SortableList } from "@/components/ui/sortable-list"
import { StockItem } from "@/lib/types"
import { toast } from "sonner"
import { pluralizeUnit } from "@/lib/units"
import { cn } from "@/lib/utils"

interface StockTableProps {
  onViewHistory: (item: StockItem) => void;
  onAddItem: () => void;
}

export function StockTable({ onViewHistory }: StockTableProps) {
  const categories = useStockStore((state) => state.categories)
  const selectedCategoryId = useStockStore((state) => state.selectedCategoryId)
  const removeItem = useStockStore((state) => state.removeItem)
  const reorderItems = useStockStore((state) => state.reorderItems)
  const [editingItem, setEditingItem] = useState<{
    item: StockItem
    categoryId: string
    categoryName: string
  } | null>(null)
  const activeCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId) || categories[0],
    [categories, selectedCategoryId]
  )
  const materials = useMemo(
    () =>
      activeCategory
        ? activeCategory.items.map((item) => ({ ...item, category: activeCategory.name }))
        : [],
    [activeCategory]
  )
  const [selectedMaterial, setSelectedMaterial] = useState<{
    item: StockItem
    categoryId: string
  } | null>(null)
  const [movementType, setMovementType] = useState<"entrada" | "saida">("entrada")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const findItemAndCategory = (id: string) => {
    for (const cat of categories) {
      const item = cat.items.find((i) => i.id === id)
      if (item) return { item, categoryId: cat.id, categoryName: cat.name }
    }
    return null
  }

  const handleMovement = (id: string, type: "entrada" | "saida") => {
    const result = findItemAndCategory(id)
    if (result) {
      setSelectedMaterial(result)
      setMovementType(type)
      setIsDialogOpen(true)
    }
  }

  const handleEditItem = (id: string) => {
    const result = findItemAndCategory(id)
    if (result) {
      setEditingItem({
        item: result.item,
        categoryId: result.categoryId,
        categoryName: result.categoryName,
      })
    }
  }

  const handleDeleteItem = (id: string) => {
    const result = findItemAndCategory(id)
    if (!result) return

    removeItem(result.categoryId, id)
    toast.success(`Item "${result.item.name}" excluído`) 
  }

  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      {/* Mobile: card list */}
      <div className="md:hidden">
        {materials.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum material cadastrado.
          </div>
        ) : (
          <SortableList
            className="divide-y"
            items={materials}
            onReorder={(ids) => activeCategory && reorderItems(activeCategory.id, ids)}
            renderItem={(item, handle) => {
              const zero = item.quantity === 0
              const low = !zero && item.quantity <= item.minQuantity
              return (
                <div className={cn(
                  "p-3",
                  zero && "bg-destructive/5",
                  low && "bg-warning/5",
                )}>
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
                    <p className="truncate text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <div className={cn(
                    "shrink-0 text-right text-sm tabular-nums font-semibold whitespace-nowrap",
                    zero && "text-destructive",
                    low && "text-warning",
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
                    onClick={() => handleMovement(item.id, "entrada")}
                  >
                    <ArrowUpCircle className="mr-1 h-4 w-4" />
                    Entrada
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleMovement(item.id, "saida")}
                  >
                    <ArrowDownCircle className="mr-1 h-4 w-4" />
                    Saída
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewHistory(item)}>
                        <History className="mr-2 h-4 w-4" /> Histórico
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditItem(item.id)}>
                        <PenSquare className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteItem(item.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              )
            }}
          />
        )}
      </div>

      {/* Desktop / tablet: table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8 px-2"></TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Material</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">Categoria</TableHead>
            <TableHead className="text-right text-xs font-semibold text-muted-foreground">Estoque</TableHead>
            <TableHead className="text-right text-xs font-semibold text-muted-foreground">Ações</TableHead>
          </TableRow>
        </TableHeader>
        {materials.length === 0 ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                Nenhum material cadastrado.
              </TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <SortableList
            asTbody
            items={materials}
            onReorder={(ids) => activeCategory && reorderItems(activeCategory.id, ids)}
            renderItem={(item, handle) => (
              <TableRow>
                <TableCell className="w-8 px-2">
                  <button
                    ref={handle.setActivatorNodeRef}
                    {...handle.attributes}
                    {...handle.listeners}
                    type="button"
                    aria-label="Mover item"
                    className="cursor-grab touch-none rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(() => {
                    const zero = item.quantity === 0
                    const low = !zero && item.quantity <= item.minQuantity
                    return (
                      <span className={cn(
                        "font-semibold",
                        zero && "text-destructive",
                        low && "text-warning",
                        !zero && !low && "text-foreground",
                      )}>
                        {item.quantity.toLocaleString("pt-BR")}{" "}
                        <span className="text-muted-foreground font-normal">
                          {pluralizeUnit(item.quantity, item.unit)}
                        </span>
                      </span>
                    )
                  })()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-success border-success/30 hover:bg-success/10 h-8"
                      onClick={() => handleMovement(item.id, "entrada")}
                    >
                      <ArrowUpCircle className="mr-1 h-4 w-4" />
                      Entrada
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8"
                      onClick={() => handleMovement(item.id, "saida")}
                    >
                      <ArrowDownCircle className="mr-1 h-4 w-4" />
                      Saída
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewHistory(item)}>
                          <History className="mr-2 h-4 w-4" /> Histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditItem(item.id)}>
                          <PenSquare className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteItem(item.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            )}
          />
        )}
      </Table>

      {selectedMaterial && (
        <MovementDialog
          item={selectedMaterial.item}
          categoryId={selectedMaterial.categoryId}
          type={movementType}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
        />
      )}
      {editingItem && (
        <EditItemDialog
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null)
          }}
          item={editingItem.item}
          categoryId={editingItem.categoryId}
          categoryName={editingItem.categoryName}
        />
      )}
    </div>
  )
}