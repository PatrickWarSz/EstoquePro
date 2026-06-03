
import { useEffect, useState } from "react"
import { Edit3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStockStore } from "@/lib/stock-store"
import { StockItem } from "@/lib/types"
import { toast } from "sonner"

interface EditItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: StockItem
  categoryId: string
  categoryName: string
}

const UNIT_OPTIONS = [
  { value: "rolo", label: "Rolos" },
  { value: "m", label: "Metros (m)" },
  { value: "un", label: "Unidades (un)" },
  { value: "kg", label: "Quilogramas (kg)" },
  { value: "g", label: "Gramas (g)" },
]

export function EditItemDialog({
  open,
  onOpenChange,
  item,
  categoryId,
  categoryName,
}: EditItemDialogProps) {
  const updateItem = useStockStore((state) => state.updateItem)

  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity.toString())
  const [minQuantity, setMinQuantity] = useState(item.minQuantity.toString())
  const [unit, setUnit] = useState(item.unit || "rolo")

  useEffect(() => {
    setName(item.name)
    setQuantity(item.quantity.toString())
    setMinQuantity(item.minQuantity.toString())
    setUnit(item.unit || "rolo")
  }, [item])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Nome do item é obrigatório")
      return
    }

    const qty = parseFloat(quantity) || 0
    const minQty = parseFloat(minQuantity) || 0

    updateItem(categoryId, item.id, {
      name: name.trim(),
      quantity: qty,
      minQuantity: minQty,
      unit,
    })

    toast.success(`Item "${name.trim()}" atualizado em ${categoryName}`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" />
              Editar Item
            </DialogTitle>
            <DialogDescription>
              Modifique o nome, unidade ou quantidades do item selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <div className="rounded-md border bg-secondary/50 px-3 py-2 text-sm text-foreground">
                {categoryName}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-item-name">Nome do Item *</Label>
              <Input
                id="edit-item-name"
                placeholder="Ex: Suplex PRETO JB"
                value={name}
                onChange={(e) => setName(e.target.value)}

              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-item-qty">Quantidade</Label>
                <Input
                  id="edit-item-qty"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-item-unit">Unidade</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger id="edit-item-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-item-min">Estoque Mínimo de Segurança</Label>
              <Input
                id="edit-item-min"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O alerta será exibido quando o estoque ficar abaixo deste valor.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar alterações</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
