import { useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStockStore } from "@/lib/stock-store"
import { useAuthStore } from "@/lib/auth-store"
import { formatQuantity, pluralizeUnit } from "@/lib/units"
import { toast } from "sonner"

const UNIT_OPTIONS = [
  { value: "kg", label: "Quilogramas (kg)" },
  { value: "g", label: "Gramas (g)" },
  { value: "m", label: "Metros (m)" },
  { value: "rolo", label: "Rolos" },
  { value: "un", label: "Unidades" },
  { value: "cx", label: "Caixas" },
  { value: "pc", label: "Peças" },
  { value: "L", label: "Litros (L)" },
]

type Row = { include: boolean; qty: string; min: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCategoryId?: string
  /** Se informado, converte só este item */
  onlyItemId?: string
}

const parseNum = (s: string) => {
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}
// aceita "185,5" e "185.5"
const parseInput = (s: string) => {
  if (s.includes(",")) return parseNum(s)
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

export function ConvertUnitsDialog({ open, onOpenChange, initialCategoryId, onlyItemId }: Props) {
  const categories = useStockStore((s) => s.categories)
  const initialize = useStockStore((s) => s.initialize)
  const [catId, setCatId] = useState<string>("")
  const [unit, setUnit] = useState("kg")
  const [factor, setFactor] = useState("")
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [saving, setSaving] = useState(false)

  const category = categories.find((c) => c.id === catId)
  const items = useMemo(
    () => (category?.items || []).filter((i) => !onlyItemId || i.id === onlyItemId),
    [category, onlyItemId],
  )

  useEffect(() => {
    if (!open) return
    const start = initialCategoryId || categories[0]?.id || ""
    setCatId(start)
    setFactor("")
    setUnit("kg")
  }, [open, initialCategoryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r: Record<string, Row> = {}
    items.forEach((i) => { r[i.id] = { include: true, qty: "", min: "" } })
    setRows(r)
  }, [catId, items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFactor = () => {
    const f = parseInput(factor)
    if (!Number.isFinite(f) || f <= 0) { toast.error("Informe um fator válido, ex: 20"); return }
    setRows((prev) => {
      const next = { ...prev }
      items.forEach((i) => {
        next[i.id] = {
          ...next[i.id],
          qty: String(Math.round(i.quantity * f * 100) / 100).replace(".", ","),
          min: String(Math.round(i.minQuantity * f * 100) / 100).replace(".", ","),
        }
      })
      return next
    })
  }

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((p) => ({ ...p, [id]: { ...p[id], ...patch } }))

  const handleSave = async () => {
    const selected = items.filter((i) => rows[i.id]?.include)
    if (selected.length === 0) { toast.error("Selecione ao menos um item"); return }
    const parsed = selected.map((i) => ({
      item: i,
      qty: parseInput(rows[i.id].qty),
      min: rows[i.id].min.trim() === "" ? 0 : parseInput(rows[i.id].min),
    }))
    const bad = parsed.find((p) => !Number.isFinite(p.qty) || p.qty < 0 || !Number.isFinite(p.min) || p.min < 0)
    if (bad) { toast.error(`Preencha o novo estoque de "${bad.item.name}"`); return }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("A conversão precisa de internet. Tente novamente quando estiver conectado.")
      return
    }

    setSaving(true)
    try {
      const { supabase, ensureSession } = (await import("@/lib/supabase")) as any
      if (typeof ensureSession === "function") await ensureSession()
      const auth = useAuthStore.getState() as any
      const wId = auth.workspaceId
      const opName = auth.currentEmployee?.name || auth.employeeName || "Administrador"
      let ok = 0
      for (const p of parsed) {
        const { error } = await supabase.from("produtos")
          .update({ unidade: unit, quantidade: p.qty, estoque_minimo: p.min })
          .eq("id", p.item.id).eq("workspace_id", wId)
        if (error) { toast.error(`Falha em "${p.item.name}": ${error.message}`); continue }
        const note = `Conversão de unidade: de ${formatQuantity(p.item.quantity, p.item.unit)} para ${formatQuantity(p.qty, unit)}`
        await supabase.from("movimentacoes").insert([{
          workspace_id: wId, produto_id: p.item.id, tipo: "entrada", quantidade: 0,
          novo_total: p.qty, observacao: note, nome_operador: opName, data: new Date().toISOString(),
        }])
        ok++
      }
      await initialize()
      if (ok > 0) toast.success(`${ok} ${ok === 1 ? "item convertido" : "itens convertidos"} para ${pluralizeUnit(2, unit)}`)
      if (ok === parsed.length) onOpenChange(false)
    } catch (e: any) {
      toast.error(`Não foi possível converter: ${e?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Converter Unidade
          </DialogTitle>
          <DialogDescription>
            Troque a unidade (ex: de rolos para kg) e informe o estoque atual na nova unidade. O histórico é mantido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {!onlyItemId && (
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={catId} onValueChange={setCatId}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Nova unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <Label className="text-xs">Preenchimento rápido (opcional)</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Se souber a média, ex: cada rolo tem cerca de 20 kg. Depois é só ajustar o que pesou na balança.
            </p>
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder="Ex: 20" value={factor} onChange={(e) => setFactor(e.target.value)} className="max-w-[140px]" />
              <Button type="button" variant="outline" onClick={applyFactor}>Calcular</Button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum item nesta categoria.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {items.map((i) => {
                const r = rows[i.id] || { include: true, qty: "", min: "" }
                return (
                  <div key={i.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_120px_120px] sm:items-center">
                    <label className="flex items-start gap-2 min-w-0">
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={r.include} onChange={(e) => setRow(i.id, { include: e.target.checked })} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium break-words">{i.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          Atual: {formatQuantity(i.quantity, i.unit)} · mínimo {formatQuantity(i.minQuantity, i.unit)}
                        </span>
                      </span>
                    </label>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Novo estoque ({pluralizeUnit(2, unit, { short: true })})</Label>
                      <Input inputMode="decimal" placeholder="0" disabled={!r.include} value={r.qty} onChange={(e) => setRow(i.id, { qty: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Novo mínimo</Label>
                      <Input inputMode="decimal" placeholder="0" disabled={!r.include} value={r.min} onChange={(e) => setRow(i.id, { min: e.target.value })} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar conversão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
