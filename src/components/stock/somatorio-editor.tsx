import { useEffect, useMemo, useState } from "react"
import { Search, Sigma } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useStockStore } from "@/lib/stock-store"
import { useAuthStore } from "@/lib/auth-store"
import {
  useSomatoriosStore,
  type Somatorio,
} from "@/lib/somatorios-store"
import { pluralizeUnit } from "@/lib/units"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: Somatorio | null
}

function effectiveUnit(catUnit?: string, itUnit?: string) {
  return (itUnit || catUnit || "").trim()
}

export function SomatorioEditor({ open, onOpenChange, editing }: Props) {
  const { categories } = useStockStore()
  const workspaceId = useAuthStore((s) => s.workspaceId)
  const add = useSomatoriosStore((s) => s.add)
  const update = useSomatoriosStore((s) => s.update)

  const [name, setName] = useState("")
  const [unit, setUnit] = useState<string>("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [minQty, setMinQty] = useState<string>("")
  const [search, setSearch] = useState("")

  // Reset ao abrir
  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setUnit(editing.unit)
      setSelected(new Set(editing.itemRefs))
      setMinQty(editing.minQuantity != null ? String(editing.minQuantity) : "")
    } else {
      setName("")
      setUnit("")
      setSelected(new Set())
      setMinQty("")
    }
    setSearch("")
  }, [open, editing])

  // Lista de unidades disponíveis no estoque
  const availableUnits = useMemo(() => {
    const set = new Set<string>()
    for (const c of categories || []) {
      for (const it of c.items || []) {
        const u = effectiveUnit(c.unit, it.unit)
        if (u) set.add(u)
      }
    }
    return Array.from(set).sort()
  }, [categories])

  // Itens compatíveis com a unidade escolhida + filtro de busca
  const groups = useMemo(() => {
    if (!unit) return []
    const q = search.trim().toLowerCase()
    return (categories || [])
      .map((cat) => {
        const items = (cat.items || []).filter((it) => {
          const u = effectiveUnit(cat.unit, it.unit)
          if (u !== unit) return false
          if (!q) return true
          return (
            it.name.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q)
          )
        })
        return { cat, items }
      })
      .filter((g) => g.items.length > 0)
  }, [categories, unit, search])

  const previewTotal = useMemo(() => {
    let total = 0
    for (const c of categories || []) {
      for (const it of c.items || []) {
        if (selected.has(`${c.id}:${it.id}`)) total += Number(it.quantity) || 0
      }
    }
    return total
  }, [categories, selected])

  const toggle = (ref: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  const toggleCategory = (refs: string[], allOn: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOn) refs.forEach((r) => next.delete(r))
      else refs.forEach((r) => next.add(r))
      return next
    })
  }

  // Trocar unidade limpa seleção incompatível
  const handleUnitChange = (u: string) => {
    setUnit(u)
    if (!u) return setSelected(new Set())
    setSelected((prev) => {
      const next = new Set<string>()
      for (const ref of prev) {
        const [catId, itemId] = ref.split(":")
        const cat = categories.find((c) => c.id === catId)
        const it = cat?.items.find((i) => i.id === itemId)
        if (it && effectiveUnit(cat?.unit, it.unit) === u) next.add(ref)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Dê um nome ao somatório.")
    if (!unit) return toast.error("Escolha a unidade.")
    if (selected.size === 0) return toast.error("Selecione ao menos 1 item.")
    const min =
      minQty.trim() === "" ? null : Math.max(0, Number(minQty.replace(",", ".")) || 0)

    try {
      if (editing) {
        await update(editing.id, {
          name: name.trim(),
          unit,
          itemRefs: Array.from(selected),
          minQuantity: min,
        })
        toast.success("Somatório atualizado.")
      } else {
        if (!workspaceId) {
          toast.error("Sessão sem workspace ativo.")
          return
        }
        await add({
          workspaceId,
          name: name.trim(),
          unit,
          itemRefs: Array.from(selected),
          minQuantity: min,
        })
        toast.success("Somatório criado.")
      }
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar somatório.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sigma className="h-4 w-4" />
            {editing ? "Editar somatório" : "Novo somatório"}
          </DialogTitle>
          <DialogDescription>
            Selecione itens para somar. Todos precisam usar a mesma unidade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="som-name">Nome</Label>
              <Input
                id="som-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Tecidos pretos"
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={handleUnitChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Nenhum item com unidade definida.
                    </div>
                  ) : (
                    availableUnits.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u} — {pluralizeUnit(2, u)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="som-min">
              Estoque mínimo total{" "}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="som-min"
              inputMode="decimal"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              placeholder="Ex: 50"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>Itens compatíveis</Label>
              <Badge variant="outline" className="font-mono text-[11px]">
                {selected.size} selecionado(s) · total {previewTotal.toLocaleString("pt-BR")}{" "}
                {unit}
              </Badge>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar item ou categoria…"
                className="h-9 pl-8"
                disabled={!unit}
              />
            </div>

            <ScrollArea className="h-[280px] rounded-md border">
              {!unit ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Escolha uma unidade para ver os itens.
                </p>
              ) : groups.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum item com a unidade <b>{unit}</b>.
                </p>
              ) : (
                <div className="divide-y">
                  {groups.map(({ cat, items }) => {
                    const refs = items.map((it) => `${cat.id}:${it.id}`)
                    const allOn = refs.every((r) => selected.has(r))
                    const someOn = refs.some((r) => selected.has(r))
                    return (
                      <div key={cat.id} className="p-2">
                        <button
                          type="button"
                          onClick={() => toggleCategory(refs, allOn)}
                          className={cn(
                            "mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider hover:bg-muted",
                            someOn && "text-primary",
                          )}
                        >
                          <span>{cat.name}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {allOn ? "desmarcar todos" : "marcar todos"}
                          </span>
                        </button>
                        <div className="space-y-0.5">
                          {items.map((it) => {
                            const ref = `${cat.id}:${it.id}`
                            const checked = selected.has(ref)
                            return (
                              <label
                                key={ref}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted",
                                  checked && "bg-primary/5",
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggle(ref)}
                                />
                                <span className="flex-1 truncate">{it.name}</span>
                                <span className="tabular-nums text-xs text-muted-foreground">
                                  {Number(it.quantity).toLocaleString("pt-BR")} {unit}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {editing ? "Salvar alterações" : "Criar somatório"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}