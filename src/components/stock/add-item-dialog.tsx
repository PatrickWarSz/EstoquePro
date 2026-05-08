
import { useState } from "react"
import { Plus } from "lucide-react"
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
import { toast } from "sonner"

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select a category if coming from a specific category view */
  defaultCategoryId?: string
}

const UNIT_OPTIONS =[
  { value: "un",    label: "Unidades (un)" },
  { value: "pc",    label: "Peças (pç)" },
  { value: "cx",    label: "Caixas (cx)" },
  { value: "par",   label: "Pares" },
  { value: "kit",   label: "Kits" },
  { value: "rolo",  label: "Rolos" },
  { value: "m",     label: "Metros (m)" },
  { value: "cm",    label: "Centímetros (cm)" },
  { value: "kg",    label: "Quilogramas (kg)" },
  { value: "g",     label: "Gramas (g)" },
  { value: "L",     label: "Litros (L)" },
  { value: "ml",    label: "Mililitros (ml)" },
]

export function AddItemDialog({
  open,
  onOpenChange,
  defaultCategoryId,
}: AddItemDialogProps) {
  const { categories, selectedCategoryId, addItem } = useStockStore()

  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [minQuantity, setMinQuantity] = useState("")
  const [unit, setUnit] = useState("rolo")
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId || selectedCategoryId || ""
  )

  const safeCategories = categories || []
  const selectedCategory = safeCategories.find((c) => c.id === categoryId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Nome do item é obrigatório")
      return
    }
    if (!categoryId) {
      toast.error("Selecione uma categoria")
      return
    }

    const qty = parseFloat(quantity) || 0
    const minQty = parseFloat(minQuantity) || 0

    addItem(categoryId, {
      name: name.trim(),
      quantity: qty,
      minQuantity: minQty,
      unit,
    } as any)

    toast.success(`Item "${name.trim()}" adicionado em ${selectedCategory?.name}`)
    reset()
    onOpenChange(false)
  }

  const reset = () => {
    setName("")
    setQuantity("")
    setMinQuantity("")
    setUnit("rolo")
    setCategoryId(defaultCategoryId || selectedCategoryId || "")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Adicionar Novo Item
            </DialogTitle>
            <DialogDescription>
              Preencha as informações do novo item de matéria prima
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Category selector */}
            <div className="grid gap-2">
              <Label htmlFor="cat-select">Categoria *</Label>
              {safeCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma categoria cadastrada. Crie uma primeiro.
                </p>
              ) : (
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v)
                    // Auto-set unit from category unit
                    const cat = safeCategories.find((c) => c.id === v)
                    if (cat?.unit) setUnit(cat.unit)
                  }}
                >
                  <SelectTrigger id="cat-select">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="item-name">Nome do Item *</Label>
              <Input
                id="item-name"
                placeholder="Ex: Suplex PRETO JB"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Quantity + Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="item-qty">Quantidade Inicial</Label>
                <Input
                  id="item-qty"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-unit">Unidade</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger id="item-unit">
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

            {/* Min quantity */}
            <div className="grid gap-2">
              <Label htmlFor="item-min">Estoque Mínimo de Segurança</Label>
              <Input
                id="item-min"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Alerta será exibido quando o estoque ficar abaixo deste valor
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={safeCategories.length === 0}>
              Adicionar Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
