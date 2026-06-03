import { useState } from "react"
import { Plus, Trash2, CheckCircle2 } from "lucide-react"
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
  defaultCategoryId?: string
}

const UNIT_OPTIONS = [
  { value: "un", label: "Unidades (un)" },
  { value: "pc", label: "Peças (pç)" },
  { value: "cx", label: "Caixas (cx)" },
  { value: "par", label: "Pares" },
  { value: "kit", label: "Kits" },
  { value: "rolo", label: "Rolos" },
  { value: "m", label: "Metros (m)" },
  { value: "cm", label: "Centímetros (cm)" },
  { value: "kg", label: "Quilogramas (kg)" },
  { value: "g", label: "Gramas (g)" },
  { value: "L", label: "Litros (L)" },
  { value: "ml", label: "Mililitros (ml)" },
]

interface ItemDraft {
  name: string
  quantity: string
  minQuantity: string
  unit: string
}

const emptyDraft = (): ItemDraft => ({ name: "", quantity: "", minQuantity: "", unit: "rolo" })

export function AddItemDialog({ open, onOpenChange, defaultCategoryId }: AddItemDialogProps) {
  const { categories, selectedCategoryId, addItem } = useStockStore()
  const [categoryId, setCategoryId] = useState(defaultCategoryId || selectedCategoryId || "")
  const [items, setItems] = useState<ItemDraft[]>([emptyDraft()])
  const [reviewing, setReviewing] = useState(false)

  const safeCategories = categories || []
  const selectedCategory = safeCategories.find((c) => c.id === categoryId)

  const updateItem = (idx: number, field: keyof ItemDraft, value: string) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const addRow = () => setItems((prev) => [...prev, emptyDraft()])

  const removeRow = (idx: number) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleReview = () => {
    if (!categoryId) { toast.error("Selecione uma categoria"); return }
    const valid = items.filter(it => it.name.trim())
    if (valid.length === 0) { toast.error("Informe o nome de pelo menos um item"); return }
    setReviewing(true)
  }

  const handleConfirm = async () => {
    const valid = items.filter(it => it.name.trim())
    for (const it of valid) {
      await addItem(categoryId, {
        id: crypto.randomUUID(),
        name: it.name.trim(),
        quantity: parseFloat(it.quantity) || 0,
        minQuantity: parseFloat(it.minQuantity) || 0,
        unit: it.unit,
      } as any)
    }
    toast.success(`${valid.length} item${valid.length > 1 ? 'ns' : ''} adicionado${valid.length > 1 ? 's' : ''} em ${selectedCategory?.name}`)
    reset()
    onOpenChange(false)
  }

  const reset = () => {
    setItems([emptyDraft()])
    setCategoryId(defaultCategoryId || selectedCategoryId || "")
    setReviewing(false)
  }

  const validItems = items.filter(it => it.name.trim())

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            {reviewing ? "Revisar Itens" : "Adicionar Itens"}
          </DialogTitle>
          <DialogDescription>
            {reviewing
              ? `${validItems.length} item${validItems.length > 1 ? 'ns' : ''} pronto${validItems.length > 1 ? 's' : ''} para adicionar em ${selectedCategory?.name}`
              : "Adicione um ou mais itens de uma vez"}
          </DialogDescription>
        </DialogHeader>

        {!reviewing ? (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              {safeCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma categoria. Crie uma primeiro.</p>
              ) : (
                <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); const cat = safeCategories.find(c => c.id === v); if (cat?.unit) setItems(prev => prev.map(it => ({ ...it, unit: cat.unit || it.unit }))) }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {safeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item {idx + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeRow(idx)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Nome *</Label>
                      <Input
                        placeholder="Ex: Suplex PRETO JB"
                        value={it.name}
                        onChange={(e) => updateItem(idx, "name", e.target.value)}

                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Qtd. Inicial</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Estoque Mínimo</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0" value={it.minQuantity} onChange={(e) => updateItem(idx, "minQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Unidade</Label>
                      <Select value={it.unit} onValueChange={(v) => updateItem(idx, "unit", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" className="w-full border-dashed gap-2" onClick={addRow}>
              <Plus className="h-4 w-4" /> Adicionar mais um item
            </Button>
          </div>
        ) : (
          <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
            {validItems.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCategory?.name} · {it.unit} · Qtd: {it.quantity || 0} · Mín: {it.minQuantity || 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {reviewing ? (
            <>
              <Button variant="outline" onClick={() => setReviewing(false)}>Voltar e Editar</Button>
              <Button onClick={handleConfirm} disabled={safeCategories.length === 0}>
                Confirmar e Adicionar {validItems.length} Item{validItems.length > 1 ? 'ns' : ''}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancelar</Button>
              <Button onClick={handleReview} disabled={safeCategories.length === 0}>
                Revisar {validItems.length > 0 ? `(${validItems.length})` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}