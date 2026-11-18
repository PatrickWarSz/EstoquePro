import { useMemo, useState } from "react"
import { ClipboardPaste, Copy, Loader2, Plus, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category, Order, Supplier } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  UNIT_SUGGESTIONS,
  dateInputToIso,
  dateInputValue,
  fmtCurrency,
  fmtNum,
  getDeadlineStatus,
  orderMetrics,
  parseNum,
  parsePastedItems,
  shortUnit,
  todayYmd,
} from "./orders-shared"

const INVALID = "border-destructive focus-visible:ring-destructive"

/** "categoria|item" — um único valor para o seletor de estoque */
const linkKeyOf = (catId?: string, itemId?: string) => (catId && itemId ? `${catId}|${itemId}` : "")
const splitLink = (key: string) => {
  const [categoryId, itemId] = key.split("|")
  return { categoryId, itemId }
}
const findLinked = (categories: Category[], key: string) => {
  if (!key) return undefined
  const { categoryId, itemId } = splitLink(key)
  const cat = categories.find((c) => c.id === categoryId)
  const item = cat?.items.find((i) => i.id === itemId)
  return item && cat ? { cat, item } : undefined
}

function StockSelect({
  categories,
  value,
  onChange,
  placeholder = "Sem vínculo",
  className,
}: {
  categories: Category[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">{placeholder}</SelectItem>
        {categories
          .filter((c) => c.items.length > 0)
          .map((c) => (
            <SelectGroup key={c.id}>
              <SelectLabel>{c.name}</SelectLabel>
              {c.items.map((i) => (
                <SelectItem key={i.id} value={`${c.id}|${i.id}`}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
      </SelectContent>
    </Select>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// NOVO PEDIDO (vários itens) / EDITAR PEDIDO (um item)
// ═════════════════════════════════════════════════════════════════════════════

interface Row {
  key: string
  description: string
  qty: string
  unit: string
  price: string
  link: string
}

const newRow = (unit = "kg"): Row => ({
  key: crypto.randomUUID(),
  description: "",
  qty: "",
  unit,
  price: "",
  link: "",
})

const rowTouched = (r: Row) => !!(r.description.trim() || r.qty.trim() || r.price.trim())

export function OrderFormDialog({
  open,
  onOpenChange,
  suppliers,
  categories,
  editingOrder,
  onCreate,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  suppliers: Supplier[]
  categories: Category[]
  editingOrder?: Order
  onCreate: (orders: Order[]) => Promise<void> | void
  onUpdate: (order: Order) => Promise<void> | void
}) {
  const e = editingOrder
  const [supplierId, setSupplierId] = useState(e?.supplierId || (suppliers.length === 1 ? suppliers[0].id : ""))
  const [orderDate, setOrderDate] = useState(dateInputValue(e?.orderDate))
  const [expectedDate, setExpectedDate] = useState(e?.expectedDate?.slice(0, 10) || "")
  const [notes, setNotes] = useState(e?.notes || "")
  const [rows, setRows] = useState<Row[]>(
    e
      ? [
          {
            key: e.id,
            description: e.productDescription,
            qty: String(e.quantityOrdered ?? "").replace(".", ","),
            unit: e.unit || "kg",
            price: String(e.pricePerUnit ?? "").replace(".", ","),
            link: linkKeyOf(e.linkedCategoryId, e.linkedItemId),
          },
        ]
      : [newRow(), newRow()]
  )
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")

  const multi = !e

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const focusDesc = (key: string) =>
    requestAnimationFrame(() =>
      (document.querySelector(`[data-desc="${key}"]`) as HTMLInputElement | null)?.focus()
    )

  const addRow = () => {
    const last = rows[rows.length - 1]
    const row = newRow(last?.unit || "kg")
    setRows((rs) => [...rs, row])
    focusDesc(row.key)
  }

  const duplicateRow = (key: string) => {
    const idx = rows.findIndex((r) => r.key === key)
    if (idx < 0) return
    const copy = { ...rows[idx], key: crypto.randomUUID() }
    setRows((rs) => [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)])
    focusDesc(copy.key)
  }

  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))

  const importPasted = () => {
    const parsed = parsePastedItems(pasteText, rows[rows.length - 1]?.unit || "kg")
    if (parsed.length === 0) {
      toast.error("Não encontrei nenhuma linha para importar")
      return
    }
    const imported: Row[] = parsed.map((p) => ({ ...newRow(p.unit), description: p.description, qty: p.qty, price: p.price }))
    setRows((rs) => [...rs.filter(rowTouched), ...imported])
    setPasteText("")
    setPasteOpen(false)
    toast.success(`${imported.length} ${imported.length === 1 ? "item importado" : "itens importados"} — confira os valores`)
  }

  const totals = useMemo(() => {
    let value = 0
    let qty = 0
    let count = 0
    const units = new Set<string>()
    rows.filter(rowTouched).forEach((r) => {
      const q = parseNum(r.qty)
      const p = parseNum(r.price)
      if (q > 0) {
        qty += q
        units.add(shortUnit(r.unit))
        count++
        if (p >= 0) value += q * p
      }
    })
    return { value, qty, count, unit: units.size === 1 ? [...units][0] : null }
  }, [rows])

  const rowInvalid = (r: Row) => ({
    description: !r.description.trim(),
    qty: !(parseNum(r.qty) > 0),
    unit: !r.unit.trim(),
    price: !(parseNum(r.price) >= 0),
  })

  const handleSave = async () => {
    if (!supplierId) {
      setShowErrors(true)
      toast.error("Selecione o fornecedor")
      return
    }
    const filled = rows.filter(rowTouched)
    if (filled.length === 0) {
      setShowErrors(true)
      toast.error("Adicione pelo menos um item")
      return
    }
    const bad = filled.filter((r) => Object.values(rowInvalid(r)).some(Boolean))
    if (bad.length > 0) {
      setShowErrors(true)
      toast.error(`Confira ${bad.length === 1 ? "o item destacado" : "os itens destacados"} em vermelho`)
      return
    }

    const stamp = e ? e.orderDate : orderDate === todayYmd() ? new Date().toISOString() : dateInputToIso(orderDate)
    const expectedIso = expectedDate ? dateInputToIso(expectedDate) : undefined

    const built: Order[] = filled.map((r) => {
      const linked = r.link ? splitLink(r.link) : undefined
      return {
        id: e?.id || crypto.randomUUID(),
        supplierId,
        productDescription: r.description.trim(),
        linkedCategoryId: linked?.categoryId,
        linkedItemId: linked?.itemId,
        orderDate: stamp,
        expectedDate: expectedIso,
        deliveryDate: e?.deliveryDate,
        quantityOrdered: parseNum(r.qty),
        quantityDelivered: e?.quantityDelivered || 0,
        quantityReturned: e?.quantityReturned || 0,
        stockEntryQuantity: e?.stockEntryQuantity,
        unit: r.unit.trim(),
        pricePerUnit: parseNum(r.price),
        deadlineStatus: getDeadlineStatus(expectedIso, e?.deliveryDate),
        deliveryStatus: e?.deliveryStatus || "Entrega Incompleta",
        notes: notes.trim(),
        stockEntryCreated: e?.stockEntryCreated || false,
        deliveries: e?.deliveries || [],
      }
    })

    setSaving(true)
    try {
      if (e) await onUpdate(built[0])
      else await onCreate(built)
    } finally {
      setSaving(false)
    }
  }

  const GRID = "md:grid-cols-[minmax(0,2.2fr)_88px_72px_112px_104px_minmax(0,1.6fr)_68px]"

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent
        className="flex max-w-5xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(ev) => ev.preventDefault()}
      >
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>{e ? "Editar item do pedido" : "Novo pedido"}</DialogTitle>
          <DialogDescription>
            {e
              ? "Ajuste os dados deste item."
              : "Lance todos os itens da compra de uma vez — fornecedor, data e previsão valem para todos."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Dados gerais */}
          <div className={cn("grid gap-4", e ? "sm:grid-cols-2" : "sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]")}>
            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className={cn(showErrors && !supplierId && INVALID)}>
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && (
                <p className="text-xs text-muted-foreground">Cadastre um fornecedor na aba Fornecedores primeiro.</p>
              )}
            </div>
            {!e && (
              <div className="space-y-1.5">
                <Label>Data do pedido</Label>
                <Input type="date" value={orderDate} onChange={(ev) => setOrderDate(ev.target.value || todayYmd())} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Previsão de entrega</Label>
              <Input type="date" value={expectedDate} onChange={(ev) => setExpectedDate(ev.target.value)} />
            </div>
          </div>

          {/* Itens */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{e ? "Item" : "Itens do pedido"}</h3>
                {multi && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {rows.filter(rowTouched).length}
                  </span>
                )}
              </div>
              {multi && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setPasteOpen((v) => !v)}>
                    <ClipboardPaste className="h-4 w-4" /> Colar lista
                  </Button>
                  <Button type="button" size="sm" className="gap-1.5" onClick={addRow}>
                    <Plus className="h-4 w-4" /> Adicionar item
                  </Button>
                </div>
              )}
            </div>

            {multi && pasteOpen && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Cole da planilha ou digite uma linha por item: <strong>Produto</strong>, <strong>Quantidade</strong>,{" "}
                  <strong>Preço</strong> (separados por TAB ou ponto e vírgula). Ex.:{" "}
                  <span className="font-mono">Suplex Preto; 1008; 42,90</span>
                </p>
                <Textarea
                  value={pasteText}
                  onChange={(ev) => setPasteText(ev.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={"Suplex Canelado Preto\t1008\t42,90\nSuplex Canelado Marinho\t1008\t42,90"}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={importPasted}>
                    Importar linhas
                  </Button>
                </div>
              </div>
            )}

            {/* cabeçalho das colunas (desktop) */}
            <div className={cn("hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid", GRID)}>
              <span>Produto / descrição</span>
              <span>Qtd</span>
              <span>Un</span>
              <span>Preço / un (R$)</span>
              <span className="text-right">Subtotal</span>
              <span>Item do estoque</span>
              <span />
            </div>

            <div className="space-y-2">
              {rows.map((r, idx) => {
                const inv = showErrors && rowTouched(r) ? rowInvalid(r) : null
                const sub = parseNum(r.qty) > 0 && parseNum(r.price) >= 0 ? parseNum(r.qty) * parseNum(r.price) : null
                const isLast = idx === rows.length - 1
                return (
                  <div
                    key={r.key}
                    className={cn(
                      "grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 md:items-center md:border-0 md:bg-transparent md:p-0",
                      GRID
                    )}
                  >
                    <div className="col-span-2 md:col-span-1">
                      <Label className="mb-1 block text-xs md:sr-only">Produto / descrição</Label>
                      <Input
                        data-desc={r.key}
                        placeholder="Ex: Suplex Canelado Preto"
                        value={r.description}
                        onChange={(ev) => patch(r.key, { description: ev.target.value })}
                        className={cn(inv?.description && INVALID)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs md:sr-only">Qtd</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        value={r.qty}
                        onChange={(ev) => patch(r.key, { qty: ev.target.value })}
                        className={cn("tabular-nums", inv?.qty && INVALID)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs md:sr-only">Un</Label>
                      <Input
                        list="orders-unit-list"
                        value={r.unit}
                        onChange={(ev) => patch(r.key, { unit: ev.target.value })}
                        className={cn(inv?.unit && INVALID)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs md:sr-only">Preço / un (R$)</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={r.price}
                        onChange={(ev) => patch(r.key, { price: ev.target.value })}
                        onKeyDown={(ev) => {
                          if (multi && isLast && ev.key === "Enter") {
                            ev.preventDefault()
                            addRow()
                          }
                        }}
                        className={cn("tabular-nums", inv?.price && INVALID)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <span className="text-xs text-muted-foreground md:hidden">Subtotal</span>
                      <span className="text-sm font-medium tabular-nums">{sub === null ? "—" : fmtCurrency(sub)}</span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Label className="mb-1 block text-xs md:sr-only">Item do estoque</Label>
                      <StockSelect
                        categories={categories}
                        value={r.link}
                        onChange={(v) => {
                          const found = findLinked(categories, v)
                          patch(r.key, { link: v, ...(found && !r.description.trim() ? { description: found.item.name } : {}) })
                        }}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
                      {multi && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Duplicar item" title="Duplicar item" onClick={() => duplicateRow(r.key)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            aria-label="Remover item"
                            title="Remover item"
                            disabled={rows.length === 1}
                            onClick={() => removeRow(r.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <datalist id="orders-unit-list">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>

            {multi && (
              <button
                type="button"
                onClick={addRow}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-4 w-4" /> Adicionar outro item
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              Vincular ao item do estoque é opcional — é o que permite lançar a entrada automática quando o material chegar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Observação {multi && <span className="font-normal text-muted-foreground">(vale para todos os itens)</span>}</Label>
            <Textarea
              placeholder="Ex: Pré-pedido 924 · prazo 30/60/90 dias"
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-sm">
            <span className="text-muted-foreground">
              {totals.count} {totals.count === 1 ? "item" : "itens"}
              {totals.unit ? ` · ${fmtNum(totals.qty)} ${totals.unit}` : ""} ·{" "}
            </span>
            <strong className="tabular-nums">{fmtCurrency(totals.value)}</strong>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {e ? "Salvar alterações" : totals.count > 1 ? `Criar pedido (${totals.count} itens)` : "Criar pedido"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// RECEBER (um ou vários itens de uma vez)
// ═════════════════════════════════════════════════════════════════════════════

export interface ReceivePayload {
  deliveryDate: string
  notes?: string
  items: Array<{
    order: Order
    quantity: number
    createStockEntry: boolean
    stockEntryQuantity?: number
    linkCategoryId?: string
    linkItemId?: string
  }>
}

interface RecvRow {
  qty: string
  stockQty: string
  stockTouched: boolean
  link: string
}

export function ReceiveDialog({
  open,
  onOpenChange,
  orders,
  suppliers,
  categories,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orders: Order[]
  suppliers: Supplier[]
  categories: Category[]
  onConfirm: (payload: ReceivePayload, onProgress: (done: number, total: number) => void) => Promise<void>
}) {
  const [deliveryDate, setDeliveryDate] = useState(todayYmd())
  const [notes, setNotes] = useState("")
  const [createEntry, setCreateEntry] = useState(true)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [rows, setRows] = useState<Record<string, RecvRow>>(() =>
    Object.fromEntries(
      orders.map((o) => [o.id, { qty: "", stockQty: "", stockTouched: false, link: linkKeyOf(o.linkedCategoryId, o.linkedItemId) }])
    )
  )

  const supplierName = suppliers.find((s) => s.id === orders[0]?.supplierId)?.name
  const multi = orders.length > 1

  const linkedOf = (o: Order) => findLinked(categories, rows[o.id]?.link || "")
  const sameUnit = (o: Order) => {
    const l = linkedOf(o)
    return !!l && (l.item.unit || "").toLowerCase() === (o.unit || "").toLowerCase()
  }

  const patch = (id: string, p: Partial<RecvRow>) => setRows((rs) => ({ ...rs, [id]: { ...rs[id], ...p } }))

  const setQty = (o: Order, qty: string) => {
    const r = rows[o.id]
    const next: Partial<RecvRow> = { qty }
    if (!r.stockTouched && sameUnit(o)) next.stockQty = qty
    patch(o.id, next)
  }

  const fillBalance = (o: Order) => {
    const bal = Math.max(0, (Number(o.quantityOrdered) || 0) - (Number(o.quantityDelivered) || 0))
    setQty(o, String(bal).replace(".", ","))
  }

  const fillAll = () => orders.forEach(fillBalance)

  const filledCount = orders.filter((o) => parseNum(rows[o.id]?.qty || "") > 0).length

  const handleConfirm = async () => {
    const items: ReceivePayload["items"] = []
    for (const o of orders) {
      const r = rows[o.id]
      const q = parseNum(r.qty)
      if (!(q > 0)) continue
      const key = r.link
      const stockQ = parseNum(r.stockQty)
      if (createEntry && key && !(stockQ > 0)) {
        toast.error(`Informe a entrada no estoque de "${o.productDescription}" (ou desligue o lançamento no estoque)`)
        return
      }
      const willStock = createEntry && !!key && stockQ > 0
      const link = key ? splitLink(key) : undefined
      items.push({
        order: o,
        quantity: q,
        createStockEntry: willStock,
        stockEntryQuantity: willStock ? stockQ : undefined,
        linkCategoryId: willStock ? link?.categoryId : undefined,
        linkItemId: willStock ? link?.itemId : undefined,
      })
    }
    if (items.length === 0) {
      toast.error("Informe a quantidade recebida de pelo menos um item")
      return
    }
    setSaving(true)
    setProgress({ done: 0, total: items.length })
    try {
      await onConfirm(
        { deliveryDate: dateInputToIso(deliveryDate), notes: notes.trim() || undefined, items },
        (done, total) => setProgress({ done, total })
      )
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  const GRID = "md:grid-cols-[minmax(0,1.7fr)_84px_84px_minmax(0,1.3fr)_minmax(0,1.3fr)]"

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent
        className="flex max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(ev) => ev.preventDefault()}
      >
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-success" />
            {multi ? "Receber itens" : "Receber item"}
          </DialogTitle>
          <DialogDescription>
            {supplierName ? `${supplierName} · ` : ""}
            Preencha só o que chegou — itens sem quantidade ficam como estão.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label>Data do recebimento</Label>
              <Input type="date" value={deliveryDate} onChange={(ev) => setDeliveryDate(ev.target.value || todayYmd())} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input
                placeholder="Ex: Romaneio 1234, diferença de tonalidade…"
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Lançar entrada no estoque</p>
              <p className="text-xs text-muted-foreground">Soma ao item vinculado, na unidade do estoque.</p>
            </div>
            <Switch checked={createEntry} onCheckedChange={setCreateEntry} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Itens</h3>
              {multi && (
                <Button type="button" variant="outline" size="sm" onClick={fillAll}>
                  Preencher todos com o saldo
                </Button>
              )}
            </div>

            <div className={cn("hidden gap-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid", GRID)}>
              <span>Produto</span>
              <span>Pedido</span>
              <span>Já chegou</span>
              <span>Chegou agora</span>
              <span>Entra no estoque</span>
            </div>

            {orders.map((o) => {
              const r = rows[o.id]
              const m = orderMetrics(o)
              const unit = shortUnit(o.unit)
              const q = parseNum(r.qty)
              const newTotal = m.delivered + (q > 0 ? q : 0)
              const diff = newTotal - m.ordered
              const linked = linkedOf(o)
              return (
                <div key={o.id} className={cn("grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 md:items-start", GRID)}>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <p className="break-words text-sm font-medium leading-snug">{o.productDescription}</p>
                    {linked && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {linked.cat.name} → {linked.item.name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm tabular-nums">
                    <span className="mb-0.5 block text-[11px] text-muted-foreground md:hidden">Pedido</span>
                    {fmtNum(m.ordered)} <span className="text-muted-foreground">{unit}</span>
                  </div>
                  <div className="text-sm tabular-nums">
                    <span className="mb-0.5 block text-[11px] text-muted-foreground md:hidden">Já chegou</span>
                    {m.delivered > 0 ? fmtNum(m.delivered) : "—"}
                  </div>

                  <div className="col-span-2 space-y-1 md:col-span-1">
                    <span className="block text-[11px] text-muted-foreground md:hidden">Chegou agora ({unit})</span>
                    <div className="flex gap-1.5">
                      <Input
                        inputMode="decimal"
                        placeholder={fmtNum(m.pending)}
                        value={r.qty}
                        onChange={(ev) => setQty(o, ev.target.value)}
                        className="tabular-nums"
                      />
                      <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 px-2.5" onClick={() => fillBalance(o)} title="Preencher com o saldo">
                        Saldo
                      </Button>
                    </div>
                    {q > 0 && (
                      <p
                        className={cn(
                          "text-xs",
                          diff === 0 ? "font-medium text-success" : "text-muted-foreground"
                        )}
                      >
                        {diff > 0
                          ? `+${fmtNum(diff)} ${unit} acima do pedido`
                          : diff < 0
                          ? `Ainda faltarão ${fmtNum(-diff)} ${unit}`
                          : "Completa — fecha o pedido"}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1 md:col-span-1">
                    <span className="block text-[11px] text-muted-foreground md:hidden">Entra no estoque</span>
                    {!createEntry ? (
                      <p className="pt-2 text-xs text-muted-foreground">Não vai lançar</p>
                    ) : (
                      <>
                        {!o.linkedItemId && (
                          <StockSelect
                            categories={categories}
                            value={r.link}
                            onChange={(v) => patch(o.id, { link: v, stockTouched: false })}
                            placeholder="Vincular ao estoque…"
                            className="h-9 text-xs"
                          />
                        )}
                        {r.link ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              inputMode="decimal"
                              placeholder="0"
                              value={r.stockQty}
                              onChange={(ev) => patch(o.id, { stockQty: ev.target.value, stockTouched: true })}
                              className="tabular-nums"
                            />
                            <span className="shrink-0 text-xs text-muted-foreground">{linked?.item.unit || "un"}</span>
                          </div>
                        ) : (
                          o.linkedItemId ? null : (
                            <p className="text-xs text-muted-foreground">Sem vínculo — não lança no estoque</p>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {saving && progress
              ? `Registrando ${progress.done}/${progress.total}…`
              : `${filledCount} de ${orders.length} ${orders.length === 1 ? "item" : "itens"} com quantidade`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Confirmar recebimento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
