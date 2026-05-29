
import { useState } from "react"
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SortableList } from "@/components/ui/sortable-list"
import { useStockStore } from "@/lib/stock-store"
import { toast } from "sonner"

interface CategoryEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoryEditor({ open, onOpenChange }: CategoryEditorProps) {
  const { categories, addCategory, updateCategory, removeCategory, reorderCategories } =
    useStockStore()
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; itemCount: number } | null>(null)

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      toast.error("Nome da categoria é obrigatório")
      return
    }

    addCategory({
      id: crypto.randomUUID(),
      name: newCategoryName.trim(),
      items: [],
    })

    toast.success(`Categoria "${newCategoryName}" adicionada`)
    setNewCategoryName("")
  }

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) return

    updateCategory(editingId, editingName.trim())
    toast.success("Categoria atualizada")
    setEditingId(null)
    setEditingName("")
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName("")
  }

  const handleDelete = (id: string, name: string) => {
    const category = (categories || []).find((c) => c.id === id)
    setPendingDelete({ id, name, itemCount: category?.items.length ?? 0 })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const { id, name, itemCount } = pendingDelete
    try {
      await removeCategory(id)
      toast.success(
        itemCount > 0
          ? `Categoria "${name}" e ${itemCount} item(s) removidos`
          : `Categoria "${name}" removida`
      )
    } catch (e) {
      toast.error("Erro ao excluir categoria")
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Gerenciar Categorias
          </DialogTitle>
          <DialogDescription>
            Adicione, edite ou remova categorias de matéria prima
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nova categoria..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            />
            <Button onClick={handleAddCategory} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[300px]">
            <SortableList
              items={categories || []}
              onReorder={(ids) => reorderCategories(ids)}
              className="space-y-2 pr-4"
              renderItem={(category, handle) => (
                <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
                  <button
                    ref={handle.setActivatorNodeRef}
                    {...handle.attributes}
                    {...handle.listeners}
                    type="button"
                    aria-label="Mover categoria"
                    className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  {editingId === category.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit()
                          if (e.key === "Escape") handleCancelEdit()
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-success hover:text-success"
                        onClick={handleSaveEdit}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={handleCancelEdit}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">
                        {category.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {category.items.length} itens
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() =>
                          handleStartEdit(category.id, category.name)
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(category.id, category.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            />
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.itemCount > 0 ? (
                <>
                  Esta categoria possui <strong>{pendingDelete.itemCount} item(s)</strong> cadastrado(s).
                  Ao continuar, <strong>todos os itens dentro dela serão excluídos permanentemente</strong>.
                  Esta ação não pode ser desfeita.
                </>
              ) : (
                <>Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
