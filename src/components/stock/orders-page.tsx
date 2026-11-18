import { useState, useMemo } from "react"
import {
  Plus,
  PackageCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
  Truck,
  Pencil,
  Trash2,
  X,
  MessageCircle,
  Undo2,
  MoreVertical,
  Copy,
  ClipboardPaste,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatQuantity, pluralizeUnit } from "@/lib/units"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStockStore } from "@/lib/stock-store"
import { Order, Supplier, Category, StockItem } from "@/lib/types"
import { StockState } from "@/lib/stock-store"
import { cn, generateDeliveryMessage, openWhatsAppWeb } from "@/lib/utils"
import { toast } from "sonner"

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return "—"
  const datePart = String(iso).slice(0, 10)
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return new Date(iso).toLocaleDateString("pt-BR")
}

function fmtShort(iso?: string) {
  const d = iso ? String(iso).slice(0, 10) : ""
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}` : "—"
}

function todayDateInputValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function dateInputValue(iso?: string) {
  return iso ? String(iso).slice(0, 10) : todayDateInputValue()
}

function dateInputToIso(date: string) {
  return `${date}T12:00:00.000Z`
}

function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(fromYmd: string, toYmd: string) {
  const a = new Date(fromYmd + "T00:00:00Z").getTime()
  const b = new Date(toYmd + "T00:00:00Z").getTime()
  return Math.round((b - a) / 86400000)
}

function getDeadlineStatus(expectedDate?: string, deliveryDate?: string): Order["deadlineStatus"] {
  const expected = expectedDate ? String(expectedDate).slice(0, 10) : ""
  const delivered = deliveryDate ? String(deliveryDate).slice(0, 10) : ""
  if (expected && delivered) return delivered <= expected ? "Entregue no Prazo" : "Entregue com Atraso"
  if (!expected) return "Dentro do Prazo"
  return todayDateInputValue() > expected ? "Pedido Atrasado" : "Dentro do Prazo"
}

function fmtCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/** Aceita "1.008", "1008", "42,90", "R$ 43.243,20", "42.9". */
function parseBR(s: string): number {
  let t = String(s ?? "").replace(/[^\d.,-]/g, "")
  if (!t) return NaN
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "")
  return Number(t)
}

const UNIT_SUGGESTIONS = ["kg", "rolo", "un", "m", "caixa", "litro"]

function normalizeUnit(u: string) {
  const x = u.toLowerCase()
  if (/^(kgs?|quilos?|quilogramas?)$/.test(x)) return "kg"
  if (/^(un|und|unid|unidades?)$/.test(x)) return "un"
  if (/^rolos?$/.test(x)) return "rolo"
  if (/^(m|mt|metros?)$/.test(x)) return "m"
  if (/^(caixas?|cx)$/.test(x)) return "caixa"
  if (/^(l|lt|litros?)$/.test(x)) return "litro"
  return x
}

/** Lê linhas coladas de um pré-pedido: "PRODUTO  1008  KG  R$ 42,90  R$ 43.243,20" */
function parsePastedItems(text: string) {
  const unitRe = "(kgs?|quilos?|quilogramas?|un|und|unid|unidades?|rolos?|m|mt|metros?|caixas?|cx|litros?|l|lt)"
  const re = new RegExp(`^(.*?)[\\s\\t]+([\\d.,]+)[\\s\\t]+${unitRe}(?:[\\s\\t]+(?:R\\$\\s*)?([\\d.,]+))?`, "i")
  const out: { desc: string; qty: string; unit: string; price: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(re)
    if (!m) continue
    const qty = parseBR(m[2])
    if (!m[1].trim() || isNaN(qty) || qty <= 0) continue
    const price = m[4] ? parseBR(m[4]) : NaN
    out.push({
      desc: m[1].trim(),
      qty: String(qty).replace(".", ","),
      unit: normalizeUnit(m[3]),
      price: isNaN(price) ? "" : String(price).replace(".", ","),
    })
  }
  return out
}

// ─── análise de cada pedido (atraso, falta, excedente) ───────────────────────

type Tone = "destructive" | "warning" | "success" | "primary" | "muted"

const toneClass: Record<Tone, string> = {
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  primary: "border-primary/30 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
}

const dotClass: Record<Tone, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  primary: "bg-primary",
  muted: "bg-muted-foreground/40",
}

interface Chip { label: string; tone: Tone; icon: typeof Clock }

function analyse(o: Order) {
  const ordered = o.quantityOrdered ?? 0
  const received = o.quantityDelivered ?? 0
  const open = o.deliveryStatus === "Entrega Incompleta"
  const remaining = Math.max(0, ordered - received)
  const excess = Math.max(0, received - ordered)
  const expected = o.expectedDate ? String(o.expectedDate).slice(0, 10) : ""
  const delivered = o.deliveryDate ? String(o.deliveryDate).slice(0, 10) : ""
  const today = todayDateInputValue()
  const diff = expected ? daysBetween(today, expected) : null // <0 = atrasado
  const late = open && diff !== null && diff < 0
  const delayDays = !open && expected && delivered && delivered > expected ? daysBetween(expected, delivered) : 0
  const closedShort = !open && remaining > 0.0001
  const hasIssue = !open && (excess > 0.0001 || closedShort)

  const chips: Chip[] = []
  let tone: Tone = "muted"
  if (open) {
    if (diff === null) chips.push({ label: "Sem previsão", tone: "muted", icon: Clock })
    else if (diff < 0) { const d = -diff; chips.push({ label: `Atrasado há ${d} ${d === 1 ? "dia" : "dias"}`, tone: "destructive", icon: AlertTriangle }) }
    else if (diff === 0) chips.push({ label: "Chega hoje", tone: "warning", icon: Truck })
    else if (diff === 1) chips.push({ label: "Chega amanhã", tone: "warning", icon: Truck })
    else if (diff <= 7) chips.push({ label: `Chega em ${diff} dias`, tone: "warning", icon: Truck })
    else chips.push({ label: `Previsto ${fmtShort(expected)}`, tone: "muted", icon: Clock })
    if (received > 0) chips.push({ label: "Parcial", tone: "primary", icon: Truck })
    tone = chips[0].tone === "muted" ? "muted" : chips[0].tone
    if (late) tone = "destructive"
  } else {
    if (excess > 0.0001) chips.push({ label: `Excedente +${fmtNum(excess)}`, tone: "primary", icon: AlertTriangle })
    else if (closedShort) chips.push({ label: `Encerrado com falta de ${fmtNum(remaining)}`, tone: "warning", icon: AlertTriangle })
    else chips.push({ label: "Completo", tone: "success", icon: CheckCircle2 })
    if (delayDays > 0) chips.push({ label: `Chegou ${delayDays} ${delayDays === 1 ? "dia" : "dias"} atrasado`, tone: "destructive", icon: AlertTriangle })
    tone = excess > 0.0001 ? "primary" : closedShort ? "warning" : "success"
  }
  return { ordered, received, open, remaining, excess, expected, diff, late, closedShort, hasIssue, chips, tone, delayDays }
}

// ─── lista principal ─────────────────────────────────────────────────────────

type FilterStatus = "open" | "late" | "done" | "issues" | "all"

export function OrdersPage() {
  const { suppliers, orders, categories, addOrder, updateOrder, removeOrder, registerDelivery, updateDelivery, finalizeOrder, revertOrder, fetchMoreOrders, ordersHasMore } =
    useStockStore() as StockState

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("open")
  const [filterSupplier, setFilterSupplier] = useState("all")
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState<Order[] | null>(null)
  const [editDeliveryOpen, setEditDeliveryOpen] = useState<Order | null>(null)
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState<Order | null>(null)
  const [generalHistoryOpen, setGeneralHistoryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Order | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null)
  const [revertConfirm, setRevertConfirm] = useState<Order | null>(null)

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "Sem fornecedor"

  const stats = useMemo(() => {
    const a = orders.map(analyse)
    return {
      total: orders.length,
      open: a.filter((x) => x.open).length,
      late: a.filter((x) => x.late).length,
      soon: a.filter((x) => x.open && x.diff !== null && x.diff >= 0 && x.diff <= 3).length,
      done: a.filter((x) => !x.open).length,
      excess: a.filter((x) => !x.open && x.excess > 0.0001).length,
      short: a.filter((x) => x.closedShort).length,
      issues: a.filter((x) => x.hasIssue).length,
    }
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = orders.filter((o) => {
      const a = analyse(o)
      if (filterSupplier !== "all" && o.supplierId !== filterSupplier) return false
      if (filterStatus === "open" && !a.open) return false
      if (filterStatus === "late" && !a.late) return false
      if (filterStatus === "done" && a.open) return false
      if (filterStatus === "issues" && !a.hasIssue) return false
      if (q) {
        const hay = `${o.productDescription} ${supplierName(o.supplierId)} ${o.notes || ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return list.sort((x, y) => {
      const a = analyse(x), b = analyse(y)
      if (a.open !== b.open) return a.open ? -1 : 1
      if (a.open) return (a.expected || "9999").localeCompare(b.expected || "9999")
      return new Date(y.deliveryDate || y.orderDate).getTime() - new Date(x.deliveryDate || x.orderDate).getTime()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filterStatus, filterSupplier, search, suppliers])

  const groups = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const o of filtered) {
      const k = o.supplierId || "_none"
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(o)
    }
    return Array.from(map.entries()).map(([supplierId, items]) => ({ supplierId, items }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const supplierChips = useMemo(() => {
    const ids = new Set(orders.map((o) => o.supplierId))
    return suppliers.filter((s) => ids.has(s.id))
  }, [orders, suppliers])

  function sendWhatsApp(order: Order) {
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const label = linkedItem ? `${linkedCat?.name} → ${linkedItem.name}` : undefined
    openWhatsAppWeb(generateDeliveryMessage(order, supplierName(order.supplierId), linkedItem?.unit, label))
  }

  const tabs: { id: FilterStatus; label: string; count: number; alert?: boolean }[] = [
    { id: "open", label: "Em aberto", count: stats.open },
    { id: "late", label: "Atrasados", count: stats.late, alert: stats.late > 0 },
    { id: "done", label: "Recebidos", count: stats.done },
    { id: "issues", label: "Divergências", count: stats.issues, alert: stats.issues > 0 },
    { id: "all", label: "Todos", count: stats.total },
  ]

  const alerts: { key: string; text: string; tone: Tone; go: FilterStatus }[] = []
  if (stats.late > 0) alerts.push({ key: "late", text: `${stats.late} ${stats.late === 1 ? "pedido atrasado" : "pedidos atrasados"}`, tone: "destructive", go: "late" })
  if (stats.soon > 0) alerts.push({ key: "soon", text: `${stats.soon} ${stats.soon === 1 ? "chega" : "chegam"} em até 3 dias`, tone: "warning", go: "open" })
  if (stats.short > 0) alerts.push({ key: "short", text: `${stats.short} encerrado${stats.short === 1 ? "" : "s"} com falta`, tone: "warning", go: "issues" })
  if (stats.excess > 0) alerts.push({ key: "excess", text: `${stats.excess} com excedente`, tone: "primary", go: "issues" })

  const emptyText =
    filterStatus === "late" ? "Nenhum pedido atrasado 🎉"
      : filterStatus === "open" ? "Nada para receber no momento"
      : filterStatus === "issues" ? "Nenhuma divergência de quantidade"
      : "Nenhum pedido encontrado"

  function renderRow(order: Order, isLast: boolean) {
    const a = analyse(order)
    const unit = order.unit || categories.find((c) => c.id === order.linkedCategoryId)?.items.find((i) => i.id === order.linkedItemId)?.unit || "kg"
    const price = order.pricePerUnit ?? 0
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const hasDeliveries = a.received > 0
    const show = !!expanded[order.id]
    const u = pluralizeUnit(2, unit, { short: true }) || unit

    let balance: React.ReactNode
    if (a.open) balance = <span className={cn("font-semibold", a.late ? "text-destructive" : "text-warning")}>Faltam {fmtNum(a.remaining)} {u}</span>
    else if (a.excess > 0.0001) balance = <span className="font-semibold text-primary">+{fmtNum(a.excess)} {u} a mais</span>
    else if (a.closedShort) balance = <span className="font-semibold text-warning">−{fmtNum(a.remaining)} {u} faltou</span>
    else balance = <span className="font-medium text-success">Tudo certo</span>

    return (
      <div key={order.id} className={cn(!isLast && "border-b")}>
        <div className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,0.8fr))_auto] md:items-center">
          {/* Produto + selos */}
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dotClass[a.tone])} />
            <div className="min-w-0">
              <p className="break-words font-medium leading-snug">{order.productDescription}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {a.chips.map((c, i) => {
                  const Icon = c.icon
                  return (
                    <Badge key={i} variant="outline" className={cn("gap-1 whitespace-nowrap px-2 py-0 text-[11px] font-medium", toneClass[c.tone])}>
                      <Icon className="h-3 w-3" />{c.label}
                    </Badge>
                  )
                })}
                {a.open && a.expected && <span className="text-xs text-muted-foreground">previsão {fmtDate(a.expected)}</span>}
                {!a.open && order.deliveryDate && <span className="text-xs text-muted-foreground">recebido em {fmtDate(order.deliveryDate)}</span>}
              </div>
            </div>
          </div>

          {/* Quantidades */}
          <div className="grid grid-cols-3 gap-2 md:contents">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground md:hidden">Pedido</p>
              <p className="tabular-nums">{fmtNum(a.ordered)} <span className="text-muted-foreground">{u}</span></p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground md:hidden">Recebido</p>
              <p className="tabular-nums font-semibold">{fmtNum(a.received)} <span className="font-normal text-muted-foreground">{u}</span></p>
            </div>
            <div className="text-sm">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground md:hidden">Saldo</p>
              {balance}
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-1">
            {a.open ? (
              <Button size="sm" className="gap-1.5" onClick={() => setReceiveOpen([order])}>
                <Truck className="h-4 w-4" />{hasDeliveries ? "Receber resto" : "Receber"}
              </Button>
            ) : order.stockEntryCreated ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => sendWhatsApp(order)}>
                <MessageCircle className="h-4 w-4" />WhatsApp
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Detalhes" onClick={() => setExpanded((s) => ({ ...s, [order.id]: !s[order.id] }))}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", show && "rotate-180")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {a.open && !hasDeliveries && (
                  <DropdownMenuItem onClick={() => setEditOpen(order)}><Pencil className="mr-2 h-4 w-4" /> Editar pedido</DropdownMenuItem>
                )}
                {a.open && hasDeliveries && (
                  <>
                    <DropdownMenuItem onClick={() => setEditDeliveryOpen(order)}><Pencil className="mr-2 h-4 w-4" /> Corrigir recebimento</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { finalizeOrder(order.id); toast.success("Pedido encerrado") }}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar (não vem mais nada)
                    </DropdownMenuItem>
                  </>
                )}
                {order.deliveries && order.deliveries.length > 0 && (
                  <DropdownMenuItem onClick={() => setDeliveryHistoryOpen(order)}><Clock className="mr-2 h-4 w-4" /> Ver recebimentos</DropdownMenuItem>
                )}
                {!a.open && order.stockEntryCreated && (
                  <DropdownMenuItem onClick={() => sendWhatsApp(order)}><MessageCircle className="mr-2 h-4 w-4" /> Enviar no WhatsApp</DropdownMenuItem>
                )}
                {!a.open && (
                  <DropdownMenuItem onClick={() => setRevertConfirm(order)}><Undo2 className="mr-2 h-4 w-4" /> Reabrir pedido</DropdownMenuItem>
                )}
                {a.open && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirm(order)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir pedido
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {show && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 bg-muted/30 px-4 py-3 pl-9 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Data do pedido</dt><dd>{fmtDate(order.orderDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Previsão</dt><dd>{fmtDate(order.expectedDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Preço por {pluralizeUnit(1, unit)}</dt><dd className="tabular-nums">{fmtCurrency(price)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Valor {a.received ? "recebido" : "do pedido"}</dt><dd className="font-medium tabular-nums">{fmtCurrency((a.received || a.ordered) * price)}</dd></div>
            {linkedItem && (
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Item no estoque</dt><dd className="break-words text-right">{linkedCat?.name} → {linkedItem.name}</dd></div>
            )}
            {order.stockEntryCreated && (
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Entrada no estoque</dt><dd className="flex items-center gap-1 text-success"><PackageCheck className="h-4 w-4" />{order.stockEntryQuantity ? formatQuantity(order.stockEntryQuantity, linkedItem?.unit) : "lançada"}</dd></div>
            )}
            {order.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground">Observações</dt><dd className="break-words italic">{order.notes}</dd></div>}
          </dl>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
          <p className="text-sm text-muted-foreground">Acompanhe o que foi comprado, o que chegou e o que falta</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGeneralHistoryOpen(true)} className="gap-2">
            <Clock className="h-4 w-4" /><span className="hidden sm:inline">Histórico</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Novo pedido</Button>
        </div>
      </div>

      {/* Avisos */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <span className="flex items-center gap-1.5 pr-1 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" />Precisa de atenção</span>
          {alerts.map((al) => (
            <button
              key={al.key}
              type="button"
              onClick={() => { setFilterStatus(al.go); setFilterSupplier("all"); setSearch("") }}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80", toneClass[al.tone])}
            >
              {al.text}
            </button>
          ))}
        </div>
      )}

      {/* Abas */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1 border-b">
          {tabs.map((t) => {
            const active = filterStatus === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterStatus(t.id)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  t.alert ? "bg-destructive/15 text-destructive" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>{t.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Busca + fornecedores */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar produto, fornecedor ou observação…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          {search && (
            <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" onClick={() => setSearch("")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {supplierChips.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {[{ id: "all", name: "Todos os fornecedores" }, ...supplierChips].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilterSupplier(s.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filterSupplier === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista agrupada por fornecedor */}
      {groups.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <PackageCheck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{emptyText}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const openItems = g.items.filter((o) => analyse(o).open)
            const total = g.items.reduce((s, o) => s + (o.quantityOrdered ?? 0) * (o.pricePerUnit ?? 0), 0)
            const lateCount = g.items.filter((o) => analyse(o).late).length
            return (
              <Card key={g.supplierId} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{supplierName(g.supplierId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.items.length} {g.items.length === 1 ? "item" : "itens"} · {fmtCurrency(total)}
                      {lateCount > 0 && <span className="font-medium text-destructive"> · {lateCount} atrasado{lateCount > 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                  {openItems.length > 1 && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReceiveOpen(openItems)}>
                      <Truck className="h-4 w-4" />Receber vários ({openItems.length})
                    </Button>
                  )}
                </div>
                <div className="hidden grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,0.8fr))_auto] gap-x-4 border-b px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                  <span className="pl-5">Produto</span><span>Pedido</span><span>Recebido</span><span>Saldo</span><span className="w-[148px]" />
                </div>
                {g.items.map((o, i) => renderRow(o, i === g.items.length - 1))}
              </Card>
            )
          })}
        </div>
      )}

      {ordersHasMore && filtered.length > 0 && (
        <div className="flex justify-center">
          <Button
            onClick={async () => { setLoadingMore(true); await fetchMoreOrders(50, true); setLoadingMore(false) }}
            variant="outline" disabled={loadingMore} className="gap-2"
          >
            {loadingMore ? "Carregando..." : <><ChevronDown className="h-4 w-4" />Carregar mais pedidos</>}
          </Button>
        </div>
      )}

      {/* Novo pedido (vários itens) */}
      <BulkCreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers}
        categories={categories}
        onSave={async (list) => {
          for (const o of list) await addOrder(o)
          toast.success(list.length === 1 ? "Pedido criado" : `${list.length} pedidos criados`)
          setCreateOpen(false)
        }}
      />

      {/* Editar pedido */}
      {editOpen && (
        <EditOrderDialog
          open={!!editOpen}
          onOpenChange={(v) => !v && setEditOpen(null)}
          suppliers={suppliers}
          categories={categories}
          order={editOpen}
          onSave={(up) => {
            updateOrder(editOpen.id, up)
            toast.success("Pedido atualizado")
            setEditOpen(null)
          }}
        />
      )}

      {/* Receber (1 ou vários) */}
      {receiveOpen && (
        <ReceiveDialog
          open={!!receiveOpen}
          onOpenChange={(v) => !v && setReceiveOpen(null)}
          orders={receiveOpen}
          categories={categories}
          supplierName={supplierName(receiveOpen[0].supplierId)}
          onSave={async (list, date, notes) => {
            for (const r of list) {
              await registerDelivery({
                orderId: r.order.id,
                deliveryDate: dateInputToIso(date),
                quantityDelivered: r.qty,
                stockEntryQuantity: r.entry,
                notes: notes.trim() || undefined,
                createStockEntry: r.entry !== undefined && r.entry > 0,
              })
            }
            const entries = list.filter((r) => r.entry && r.entry > 0).length
            toast.success(`${list.length === 1 ? "Recebimento registrado" : `${list.length} recebimentos registrados`}${entries ? ` · ${entries} entrada${entries > 1 ? "s" : ""} no estoque` : ""}`)
            setReceiveOpen(null)
          }}
        />
      )}

      {editDeliveryOpen && (
        <EditDeliveryDialog
          open={!!editDeliveryOpen}
          onOpenChange={(v) => !v && setEditDeliveryOpen(null)}
          order={editDeliveryOpen}
          categories={categories}
          onSave={async (params) => {
            try {
              await updateDelivery({ orderId: editDeliveryOpen.id, ...params })
              toast.success("Entrega atualizada" + (params.createStockEntry ? " e lançamento no estoque ajustado!" : ""))
              setEditDeliveryOpen(null)
            } catch (error) {
              console.error("Erro ao atualizar entrega", error)
              toast.error("Não foi possível salvar a alteração da entrega")
            }
          }}
        />
      )}

      {deliveryHistoryOpen && (
        <DeliveryHistoryDialog open={!!deliveryHistoryOpen} onOpenChange={(v) => !v && setDeliveryHistoryOpen(null)} order={deliveryHistoryOpen} />
      )}

      <GeneralHistoryDialog open={generalHistoryOpen} onOpenChange={setGeneralHistoryOpen} orders={orders} suppliers={suppliers} />

      <AlertDialog open={!!revertConfirm} onOpenChange={(v) => !v && setRevertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido "{revertConfirm?.productDescription}" voltará a aparecer como em aberto. As entregas já registradas e as
              entradas já lançadas no estoque não são alteradas nem duplicadas — só o status do pedido muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (revertConfirm) { revertOrder(revertConfirm.id); toast.success("Pedido reaberto"); setRevertConfirm(null) } }}>
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido de "{deleteConfirm?.productDescription}" será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (deleteConfirm) { removeOrder(deleteConfirm.id); toast.success("Pedido removido"); setDeleteConfirm(null) } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Seletor de item do estoque (categoria + item num único campo) ───────────

const NONE = "_none"

function StockLinkSelect({
  categories, value, onChange, className,
}: {
  categories: Category[]
  value: string // "catId|itemId" ou ""
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className={className}><SelectValue placeholder="Vincular ao estoque" /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>Sem vínculo com o estoque</SelectItem>
        {categories.filter((c) => c.items.length > 0).map((c) => (
          <SelectGroup key={c.id}>
            <SelectLabel>{c.name}</SelectLabel>
            {c.items.map((i: StockItem) => (
              <SelectItem key={i.id} value={`${c.id}|${i.id}`}>{i.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function findLinked(categories: Category[], link: string) {
  const [catId, itemId] = link.split("|")
  const cat = categories.find((c) => c.id === catId)
  return { catId, itemId, item: cat?.items.find((i) => i.id === itemId) }
}

// ─── Novo pedido: vários itens de uma vez ────────────────────────────────────

interface Row { key: string; desc: string; qty: string; unit: string; price: string; link: string }

const newRow = (p: Partial<Row> = {}): Row => ({ key: crypto.randomUUID(), desc: "", qty: "", unit: "kg", price: "", link: "", ...p })
const rowIsEmpty = (r: Row) => !r.desc.trim() && !r.qty.trim() && !r.price.trim()

function BulkCreateOrderDialog({
  open, onOpenChange, suppliers, categories, onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  suppliers: Supplier[]
  categories: Category[]
  onSave: (orders: Order[]) => Promise<void>
}) {
  const [supplierId, setSupplierId] = useState("")
  const [orderDate, setOrderDate] = useState(todayDateInputValue())
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  function reset() {
    setSupplierId(""); setOrderDate(todayDateInputValue()); setExpectedDate(""); setNotes("")
    setRows([newRow(), newRow()]); setPasteOpen(false); setPasteText(""); setShowErrors(false)
  }

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const removeRow = (key: string) => setRows((rs) => (rs.length <= 1 ? [newRow()] : rs.filter((r) => r.key !== key)))
  const duplicate = (key: string) => setRows((rs) => {
    const i = rs.findIndex((r) => r.key === key)
    return [...rs.slice(0, i + 1), { ...rs[i], key: crypto.randomUUID() }, ...rs.slice(i + 1)]
  })

  function onLink(key: string, link: string) {
    const { item } = findLinked(categories, link)
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r
      return { ...r, link, desc: r.desc.trim() ? r.desc : item?.name || r.desc, unit: item?.unit && !r.qty ? item.unit : r.unit }
    }))
  }

  function importPasted() {
    const parsed = parsePastedItems(pasteText)
    if (parsed.length === 0) { toast.error("Não consegui ler nenhum item. Use: produto, quantidade, unidade e preço em cada linha."); return }
    setRows((rs) => [...rs.filter((r) => !rowIsEmpty(r)), ...parsed.map((p) => newRow(p))])
    setPasteText(""); setPasteOpen(false)
    toast.success(`${parsed.length} ${parsed.length === 1 ? "item adicionado" : "itens adicionados"}`)
  }

  const filled = rows.filter((r) => !rowIsEmpty(r))
  const rowError = (r: Row) => ({
    desc: !r.desc.trim(),
    qty: isNaN(parseBR(r.qty)) || parseBR(r.qty) <= 0,
    price: r.price.trim() === "" || isNaN(parseBR(r.price)) || parseBR(r.price) < 0,
  })
  const totals = useMemo(() => {
    const byUnit: Record<string, number> = {}
    let value = 0
    for (const r of filled) {
      const q = parseBR(r.qty), p = parseBR(r.price)
      if (!isNaN(q)) byUnit[r.unit || "un"] = (byUnit[r.unit || "un"] || 0) + q
      if (!isNaN(q) && !isNaN(p)) value += q * p
    }
    return { byUnit, value }
  }, [filled])

  async function handleSave() {
    setShowErrors(true)
    if (!supplierId) { toast.error("Selecione o fornecedor"); return }
    if (filled.length === 0) { toast.error("Adicione pelo menos um item"); return }
    if (filled.some((r) => Object.values(rowError(r)).some(Boolean))) { toast.error("Revise os itens marcados em vermelho"); return }

    const list: Order[] = filled.map((r) => {
      const { catId, itemId } = findLinked(categories, r.link)
      return {
        id: crypto.randomUUID(),
        supplierId,
        productDescription: r.desc.trim(),
        linkedCategoryId: r.link ? catId : undefined,
        linkedItemId: r.link ? itemId : undefined,
        orderDate: dateInputToIso(orderDate),
        expectedDate: expectedDate ? dateInputToIso(expectedDate) : undefined,
        deliveryDate: undefined,
        quantityOrdered: parseBR(r.qty),
        quantityDelivered: 0,
        quantityReturned: 0,
        unit: (r.unit || "kg").trim(),
        pricePerUnit: parseBR(r.price),
        deadlineStatus: getDeadlineStatus(expectedDate ? dateInputToIso(expectedDate) : undefined, undefined),
        deliveryStatus: "Entrega Incompleta",
        notes: notes.trim(),
        stockEntryCreated: false,
        deliveries: [],
      } as Order
    })
    setSaving(true)
    try { await onSave(list); reset() } finally { setSaving(false) }
  }

  const err = (cond: boolean) => (showErrors && cond ? "border-destructive focus-visible:ring-destructive" : "")

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="flex h-[92dvh] max-w-5xl flex-col gap-0 p-0 sm:h-auto sm:max-h-[92dvh]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Novo pedido</DialogTitle>
          <DialogDescription>Cadastre todos os itens de um fornecedor de uma vez.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* Dados gerais */}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Fornecedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className={err(!supplierId)}><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              {suppliers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Data do pedido</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Previsão de entrega</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              <div className="flex gap-1">
                {[7, 15, 30].map((d) => (
                  <button key={d} type="button" onClick={() => setExpectedDate(addDays(orderDate || todayDateInputValue(), d))}
                    className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">+{d} dias</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label>Observação (vale para todos os itens)</Label>
              <Input placeholder="Ex: Pré-pedido 924 · prazo 30/60/90 dias" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Itens do pedido <span className="font-normal text-muted-foreground">({filled.length})</span></p>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setPasteOpen((v) => !v)}>
                <ClipboardPaste className="h-4 w-4" />Colar lista
              </Button>
            </div>

            {pasteOpen && (
              <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Cole as linhas do pré-pedido (produto, quantidade, unidade e preço). Ex:{" "}
                  <span className="font-mono">SUPLEX GLOSS - COR PRETO 1008 KG R$ 42,90</span>
                </p>
                <Textarea rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Cole aqui…" className="font-mono text-xs" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setPasteOpen(false); setPasteText("") }}>Cancelar</Button>
                  <Button size="sm" onClick={importPasted} disabled={!pasteText.trim()}>Adicionar itens</Button>
                </div>
              </div>
            )}

            <div className="hidden grid-cols-[minmax(0,1fr)_110px_84px_120px_110px_64px] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <span>Produto / descrição</span><span>Quantidade</span><span>Unid.</span><span>Preço / un. (R$)</span><span className="text-right">Subtotal</span><span />
            </div>

            <div className="space-y-2">
              {rows.map((r, idx) => {
                const e = rowError(r)
                const q = parseBR(r.qty), p = parseBR(r.price)
                const sub = !isNaN(q) && !isNaN(p) ? q * p : null
                const active = !rowIsEmpty(r)
                return (
                  <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-2 md:grid-cols-[minmax(0,1fr)_110px_84px_120px_110px_64px] md:items-start">
                    <div className="col-span-2 space-y-1.5 md:col-span-1">
                      <Input placeholder={`Item ${idx + 1} — ex: Suplex Poliéster Preto`} value={r.desc} onChange={(ev) => patch(r.key, { desc: ev.target.value })} className={err(active && e.desc)} />
                      <StockLinkSelect categories={categories} value={r.link} onChange={(v) => onLink(r.key, v)} className="h-8 text-xs text-muted-foreground" />
                    </div>
                    <Input inputMode="decimal" placeholder="Qtd" value={r.qty} onChange={(ev) => patch(r.key, { qty: ev.target.value })} className={err(active && e.qty)} />
                    <Input list="unit-suggestions" placeholder="kg" value={r.unit} onChange={(ev) => patch(r.key, { unit: ev.target.value })} />
                    <Input inputMode="decimal" placeholder="0,00" value={r.price} onChange={(ev) => patch(r.key, { price: ev.target.value })} className={err(active && e.price)}
                      onKeyDown={(ev) => { if (ev.key === "Enter" && idx === rows.length - 1) { ev.preventDefault(); setRows((rs) => [...rs, newRow({ unit: r.unit })]) } }} />
                    <p className="flex h-10 items-center justify-end text-sm font-medium tabular-nums">{sub !== null ? fmtCurrency(sub) : "—"}</p>
                    <div className="col-span-2 flex justify-end gap-0.5 md:col-span-1">
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-8" aria-label="Duplicar item" onClick={() => duplicate(r.key)}><Copy className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-8 text-muted-foreground hover:text-destructive" aria-label="Remover item" onClick={() => removeRow(r.key)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <datalist id="unit-suggestions">{UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>

            <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={() => setRows((rs) => [...rs, newRow({ unit: rs[rs.length - 1]?.unit || "kg" })])}>
              <Plus className="h-4 w-4" />Adicionar item
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-3 border-t bg-muted/30 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <div className="text-sm">
            <span className="text-muted-foreground">{filled.length} {filled.length === 1 ? "item" : "itens"}</span>
            {Object.entries(totals.byUnit).map(([u, n]) => <span key={u} className="text-muted-foreground"> · {fmtNum(n)} {u}</span>)}
            <span className="ml-2 text-base font-bold tabular-nums">{fmtCurrency(totals.value)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Salvando…" : filled.length > 1 ? `Criar ${filled.length} pedidos` : "Criar pedido"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Editar um pedido ────────────────────────────────────────────────────────

function EditOrderDialog({
  open, onOpenChange, suppliers, categories, order, onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  suppliers: Supplier[]
  categories: Category[]
  order: Order
  onSave: (up: Partial<Order>) => void
}) {
  const [supplierId, setSupplierId] = useState(order.supplierId || "")
  const [desc, setDesc] = useState(order.productDescription || "")
  const [expectedDate, setExpectedDate] = useState(order.expectedDate?.slice(0, 10) || "")
  const [qty, setQty] = useState(String(order.quantityOrdered ?? "").replace(".", ","))
  const [unit, setUnit] = useState(order.unit || "kg")
  const [price, setPrice] = useState(String(order.pricePerUnit ?? "").replace(".", ","))
  const [link, setLink] = useState(order.linkedCategoryId && order.linkedItemId ? `${order.linkedCategoryId}|${order.linkedItemId}` : "")
  const [notes, setNotes] = useState(order.notes || "")

  function handleSave() {
    if (!supplierId) return void toast.error("Selecione o fornecedor")
    if (!desc.trim()) return void toast.error("Informe o produto")
    if (isNaN(parseBR(qty)) || parseBR(qty) <= 0) return void toast.error("Informe a quantidade pedida")
    if (isNaN(parseBR(price))) return void toast.error("Informe o preço")
    const { catId, itemId } = findLinked(categories, link)
    onSave({
      supplierId,
      productDescription: desc.trim(),
      expectedDate: expectedDate ? dateInputToIso(expectedDate) : undefined,
      quantityOrdered: parseBR(qty),
      unit: unit.trim() || "kg",
      pricePerUnit: parseBR(price),
      linkedCategoryId: link ? catId : undefined,
      linkedItemId: link ? itemId : undefined,
      notes: notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
          <DialogDescription>Pedido de {fmtDate(order.orderDate)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Produto / descrição</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-[1fr_90px_1fr] gap-3">
            <div className="space-y-1.5"><Label>Quantidade</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Unid.</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Preço / un. (R$)</Label><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Previsão de entrega</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Item do estoque (entrada automática)</Label><StockLinkSelect categories={categories} value={link} onChange={setLink} /></div>
          <div className="space-y-1.5"><Label>Observação</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Receber (um ou vários itens da mesma entrega) ───────────────────────────

interface ReceiveRow { qty: string; entry: string; entryOn: boolean; touched: boolean }

function ReceiveDialog({
  open, onOpenChange, orders, categories, supplierName, onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orders: Order[]
  categories: Category[]
  supplierName: string
  onSave: (list: { order: Order; qty: number; entry?: number }[], date: string, notes: string) => Promise<void>
}) {
  const multi = orders.length > 1
  const linkedOf = (o: Order) => categories.find((c) => c.id === o.linkedCategoryId)?.items.find((i) => i.id === o.linkedItemId)
  const unitOf = (o: Order) => (o.unit || linkedOf(o)?.unit || "kg")
  const sameUnit = (o: Order) => { const li = linkedOf(o); return !!li && li.unit.trim().toLowerCase() === unitOf(o).trim().toLowerCase() }
  const remaining = (o: Order) => Math.max(0, (o.quantityOrdered ?? 0) - (o.quantityDelivered ?? 0))
  const asStr = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",")

  const [date, setDate] = useState(todayDateInputValue())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Record<string, ReceiveRow>>(() => {
    const init: Record<string, ReceiveRow> = {}
    for (const o of orders) {
      const q = multi ? "" : asStr(remaining(o))
      init[o.id] = { qty: q, entry: multi || !sameUnit(o) ? "" : q, entryOn: !!linkedOf(o), touched: false }
    }
    return init
  })

  function setQty(o: Order, qty: string) {
    setRows((rs) => {
      const cur = rs[o.id]
      const n = parseBR(qty)
      const entry = !cur.touched && sameUnit(o) ? (isNaN(n) ? "" : asStr(n)) : cur.entry
      return { ...rs, [o.id]: { ...cur, qty, entry } }
    })
  }
  const setRow = (id: string, p: Partial<ReceiveRow>) => setRows((rs) => ({ ...rs, [id]: { ...rs[id], ...p } }))

  const active = orders.filter((o) => { const n = parseBR(rows[o.id].qty); return !isNaN(n) && n > 0 })

  async function handleSave() {
    if (active.length === 0) { toast.error("Informe a quantidade recebida de pelo menos um item"); return }
    const list: { order: Order; qty: number; entry?: number }[] = []
    for (const o of active) {
      const r = rows[o.id]
      let entry: number | undefined
      if (linkedOf(o) && r.entryOn) {
        entry = parseBR(r.entry)
        if (isNaN(entry) || entry <= 0) { toast.error(`Informe a quantidade de entrada no estoque de "${o.productDescription}"`); return }
      }
      list.push({ order: o, qty: parseBR(r.qty), entry })
    }
    setSaving(true)
    try { await onSave(list, date, notes) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-success" />{multi ? "Receber entrega" : "Registrar recebimento"}</DialogTitle>
          <DialogDescription>{multi ? `${supplierName} · preencha só o que chegou` : `${supplierName} · ${orders[0].productDescription}`}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5"><Label>Data do recebimento</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Observação (nota fiscal, romaneio…)</Label><Input placeholder="Ex: NF 1234" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>

          {multi && (
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={() => orders.forEach((o) => setQty(o, asStr(remaining(o))))}>Preencher tudo com o saldo</Button>
            </div>
          )}

          <div className="space-y-2">
            {orders.map((o) => {
              const r = rows[o.id]
              const u = unitOf(o)
              const li = linkedOf(o)
              const n = parseBR(r.qty)
              const after = (o.quantityDelivered ?? 0) + (isNaN(n) ? 0 : n)
              const ordered = o.quantityOrdered ?? 0
              let result: Chip | null = null
              if (!isNaN(n) && n > 0) {
                if (after > ordered + 0.0001) result = { label: `Excedente +${fmtNum(after - ordered)} ${u}`, tone: "primary", icon: AlertTriangle }
                else if (ordered - after > 0.0001) result = { label: `Ainda faltam ${fmtNum(ordered - after)} ${u}`, tone: "warning", icon: Clock }
                else result = { label: "Pedido completo", tone: "success", icon: CheckCircle2 }
              }
              return (
                <div key={o.id} className={cn("rounded-lg border p-3", active.includes(o) ? "border-primary/40 bg-primary/5" : "bg-card")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium leading-snug">{o.productDescription}</p>
                      <p className="text-xs text-muted-foreground">
                        Pedido {fmtNum(ordered)} {u} · já recebido {fmtNum(o.quantityDelivered ?? 0)} · saldo <strong className="text-foreground">{fmtNum(remaining(o))} {u}</strong>
                      </p>
                    </div>
                    {result && (
                      <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", toneClass[result.tone])}><result.icon className="h-3 w-3" />{result.label}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="w-40 space-y-1">
                      <Label className="text-xs">Chegou agora ({u})</Label>
                      <div className="flex gap-1">
                        <Input inputMode="decimal" placeholder="0" value={r.qty} onChange={(e) => setQty(o, e.target.value)} />
                        <Button type="button" variant="outline" className="px-2 text-xs" title="Usar o saldo" onClick={() => setQty(o, asStr(remaining(o)))}>saldo</Button>
                      </div>
                    </div>
                    {li ? (
                      <>
                        <label className="flex h-10 items-center gap-2 text-sm">
                          <Checkbox checked={r.entryOn} onCheckedChange={(v) => setRow(o.id, { entryOn: v === true })} />
                          Lançar no estoque
                        </label>
                        {r.entryOn && (
                          <div className="w-40 space-y-1">
                            <Label className="text-xs">Entrada em {li.unit}</Label>
                            <Input inputMode="decimal" placeholder="0" value={r.entry} onChange={(e) => setRow(o.id, { entry: e.target.value, touched: true })} />
                          </div>
                        )}
                        <p className="pb-2 text-xs text-muted-foreground">→ {li.name}</p>
                      </>
                    ) : (
                      <p className="pb-2 text-xs text-muted-foreground">Sem vínculo com o estoque — não lança entrada. Para vincular, edite o pedido.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/30 px-6 py-3">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave} className="gap-2">
            <Truck className="h-4 w-4" />{saving ? "Salvando…" : active.length > 1 ? `Confirmar ${active.length} itens` : "Confirmar recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Delivery Dialog ────────────────────────────────────────────────

function EditDeliveryDialog({
  open,
  onOpenChange,
  order,
  categories,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  order: Order
  categories: Category[]
  onSave: (params: {
    deliveryDate: string
    quantityDelivered: number
    stockEntryQuantity?: number
    notes?: string
    createStockEntry: boolean
    linkedCategoryId?: string
    linkedItemId?: string
  }) => void
}) {
  const [deliveryDate, setDeliveryDate] = useState(dateInputValue(order.deliveryDate))
  const [delivered, setDelivered] = useState(order.quantityDelivered?.toString() || "")
  const [stockEntryQuantity, setStockEntryQuantity] = useState(order.stockEntryQuantity?.toString() || "")
  const [notes, setNotes] = useState(order.notes || "")
  // Se a entrada já foi lançada no estoque, NÃO oferecemos lançar de novo
  // (evita duplicação). Editar aqui só ajusta data/quantidade/observação do pedido.
  const alreadyEntered = !!order.stockEntryCreated
  const [createEntry, setCreateEntry] = useState(false)
  const [linkedCategoryId, setLinkedCategoryId] = useState(order.linkedCategoryId || "")
  const [linkedItemId, setLinkedItemId] = useState(order.linkedItemId || "")

  const linkedCatItems =
    categories.find((c: Category) => c.id === linkedCategoryId)?.items || []
  const linkedItem = linkedCatItems.find((item) => item.id === linkedItemId)
  const isCompletedDelivery = order.deliveryStatus !== "Entrega Incompleta"

  const canCreateEntry =
    createEntry &&
    !!linkedCategoryId &&
    !!linkedItemId &&
    !!stockEntryQuantity &&
    Number(stockEntryQuantity) > 0

  const handleSave = () => {
    if (!isCompletedDelivery && (!delivered || isNaN(Number(delivered)) || Number(delivered) <= 0)) {
      toast.error(`Informe a quantidade entregue em ${order.unit || "kg"}`)
      return
    }
    if (!alreadyEntered && createEntry && (!linkedCategoryId || !linkedItemId)) {
      toast.error("Para lançar entrada no estoque, vincule uma categoria e item")
      return
    }
    if (!alreadyEntered && createEntry && (!stockEntryQuantity || Number(stockEntryQuantity) <= 0)) {
      toast.error("Para lançar entrada no estoque, informe a quantidade de entrada no estoque")
      return
    }

    onSave({
      deliveryDate: dateInputToIso(deliveryDate),
      quantityDelivered: isCompletedDelivery ? order.quantityDelivered : Number(delivered),
      stockEntryQuantity: alreadyEntered
        ? order.stockEntryQuantity
        : (stockEntryQuantity ? Number(stockEntryQuantity) : undefined),
      notes: notes.trim(),
      createStockEntry: alreadyEntered ? false : canCreateEntry,
      linkedCategoryId: linkedCategoryId || undefined,
      linkedItemId: linkedItemId || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-amber-600" />
            Editar Entrega
          </DialogTitle>
          <DialogDescription>{order.productDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Total solicitado:{" "}
            <strong className="text-foreground">
              {order.quantityOrdered.toLocaleString("pt-BR")} {order.unit || "kg"}
            </strong>
          </div>

          <div className="space-y-1.5">
            <Label>Data de Entrega *</Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          {!isCompletedDelivery && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade Entregue ({order.unit || "kg"}) *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                />
              </div>
              {!alreadyEntered && (
                <div className="space-y-1.5">
                  <Label>Quantidade para entrada no estoque ({linkedItem?.unit || "un"})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 5"
                    value={stockEntryQuantity}
                    onChange={(e) => setStockEntryQuantity(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe a quantidade no formato da unidade do item vinculado.
                  </p>
                </div>
              )}
            </div>
          )}

          {alreadyEntered ? (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-muted-foreground">
              <strong className="text-success">✓ Entrada já lançada no estoque</strong>
              {order.stockEntryQuantity ? (
                <span> ({order.stockEntryQuantity} {linkedItem?.unit || "un"})</span>
              ) : null}
              . Editar aqui ajusta apenas a data, quantidade entregue e observação — a entrada no estoque não será relançada.
            </div>
          ) : !isCompletedDelivery ? (
          /* Stock entry section */
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lançar entrada no estoque?
              </p>
              <button
                type="button"
                onClick={() => setCreateEntry((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  createEntry ? "bg-primary" : "bg-input"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    createEntry ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {createEntry && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={linkedCategoryId}
                    onValueChange={(v) => {
                      setLinkedCategoryId(v)
                      setLinkedItemId("")
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c: Category) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Item</Label>
                  <Select
                    value={linkedItemId}
                    onValueChange={setLinkedItemId}
                    disabled={!linkedCategoryId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {linkedCatItems.map((i: StockItem) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {createEntry && canCreateEntry && (
              <p className="text-xs text-success">
                ✓ Serão adicionados{" "}
                <strong>{stockEntryQuantity} {linkedItem?.unit || "un"}</strong> ao item selecionado
              </p>
            )}
          </div>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Pedido já concluído. Editar aqui ajusta apenas a data e observação da entrega.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              placeholder="Ex: Romaneio 1234, diferença de tonalidade..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Pencil className="h-4 w-4" />
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delivery History Dialog ────────────────────────────────────────────────

function DeliveryHistoryDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  order: Order
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-600" />
            Histórico de Entregas
          </DialogTitle>
          <DialogDescription>{order.productDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <strong>Total Pedido:</strong> {order.quantityOrdered.toLocaleString("pt-BR")} {order.unit || "kg"}
            <br />
            <strong>Total Entregue:</strong> {order.quantityDelivered.toLocaleString("pt-BR")} {order.unit || "kg"}
          </div>

          {order.deliveries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma entrega registrada ainda.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(order.deliveries || []).map((delivery, index) => (
                <Card key={delivery.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Entrega #{index + 1}
                        </Badge>
                        <span className="text-sm font-medium">
                          {fmtDate(delivery.date)}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <p>
                          <strong>Quantidade:</strong> {delivery.quantity.toLocaleString("pt-BR")} {order.unit || "kg"}
                        </p>
                        {delivery.stockEntryQuantity && (
                          <p>
                            <strong>Entrada estoque:</strong> {delivery.stockEntryQuantity} {order.unit || "kg"}
                          </p>
                        )}
                        {delivery.notes && (
                          <p>
                            <strong>Observação:</strong> {delivery.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    {delivery.createStockEntry && (
                      <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                        Estoque atualizado
                      </Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── General History Dialog ────────────────────────────────────────────────

function GeneralHistoryDialog({
  open,
  onOpenChange,
  orders,
  suppliers,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orders: Order[]
  suppliers: Supplier[]
}) {
  const allDeliveries = orders
    .flatMap((order) =>
      (order.deliveries || []).map((delivery) => ({
        ...delivery,
        order,
        supplier: suppliers.find((s) => s.id === order.supplierId),
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-600" />
            Histórico Geral de Entregas
          </DialogTitle>
          <DialogDescription>
            Todas as entregas registradas no sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {allDeliveries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma entrega registrada ainda.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {allDeliveries.map((delivery, index) => (
                <Card key={`${delivery.order.id}-${delivery.id}`} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {fmtDate(delivery.date)}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {delivery.order.productDescription}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <p>
                          <strong>Fornecedor:</strong> {delivery.supplier?.name || "—"}
                        </p>
                        <p>
                          <strong>Quantidade:</strong> {delivery.quantity.toLocaleString("pt-BR")} {delivery.order.unit || "kg"}
                        </p>
                        {delivery.stockEntryQuantity && (
                          <p>
                            <strong>Entrada estoque:</strong> {delivery.stockEntryQuantity} {delivery.order.unit || "kg"}
                          </p>
                        )}
                        {delivery.notes && (
                          <p>
                            <strong>Observação:</strong> {delivery.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-4">
                      {delivery.createStockEntry && (
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                          Estoque atualizado
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        Pedido #{delivery.order.id.slice(-6).toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
