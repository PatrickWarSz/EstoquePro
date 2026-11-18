import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  MessageCircle,
  MoreVertical,
  PackageCheck,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Undo2,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
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
  SelectItem,
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
import { useStockStore } from "@/lib/stock-store"
import type { StockState } from "@/lib/stock-store"
import type { Order, Supplier, Category, StockItem } from "@/lib/types"
import { cn, generateDeliveryMessage, openWhatsAppWeb } from "@/lib/utils"
import { toast } from "sonner"
import { OrderFormDialog, ReceiveDialog, type ReceivePayload } from "./orders-dialogs"
import {
  TONE_ACCENT,
  TONE_SOFT,
  arrivalLabel,
  dateInputToIso,
  dateInputValue,
  daysToExpected,
  fmtCurrency,
  fmtDate,
  fmtNum,
  groupInfo,
  groupOrders,
  isLate,
  isOpen,
  lineStatus,
  orderMetrics,
  shortUnit,
  type LineKind,
  type OrderGroup,
  type Tone,
} from "./orders-shared"

// ─── peças visuais ───────────────────────────────────────────────────────────

const KIND_ICON: Record<LineKind, typeof Clock> = {
  late: AlertTriangle,
  due: Truck,
  waiting: Clock,
  partial: PackageOpen,
  done: CheckCircle2,
  excess: TrendingUp,
  short: TrendingDown,
}

function Pill({ tone, icon: Icon, children }: { tone: Tone; icon?: typeof Clock; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE_SOFT[tone])}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

const ROW_GRID = "md:grid-cols-[minmax(0,1fr)_104px_104px_200px_auto]"

type Tab = "open" | "late" | "done" | "all"

export function OrdersPage() {
  const {
    suppliers, orders, categories, addOrders, updateOrder, removeOrder, registerDelivery,
    finalizeOrder, revertOrder, fetchMoreOrders, ordersHasMore,
  } = useStockStore() as StockState & { addOrders: (list: Order[]) => Promise<void> }

  const [tab, setTab] = useState<Tab>("open")
  const [search, setSearch] = useState("")
  const [filterSupplier, setFilterSupplier] = useState("all")
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Order | null>(null)
  const [receiveOrders, setReceiveOrders] = useState<Order[] | null>(null)
  const [editDeliveryOpen, setEditDeliveryOpen] = useState<Order | null>(null)
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState<Order | null>(null)
  const [generalHistoryOpen, setGeneralHistoryOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null)
  const [revertConfirm, setRevertConfirm] = useState<Order | null>(null)
  const [finalizeConfirm, setFinalizeConfirm] = useState<Order | null>(null)

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "Sem fornecedor"

  // ── compras (grupos) + indicadores ─────────────────────────────────────────
  const groups = useMemo(() => groupOrders(orders), [orders])
  const infos = useMemo(() => new Map(groups.map((g) => [g.key, groupInfo(g)])), [groups])

  const summary = useMemo(() => {
    let openGroups = 0, pendingValue = 0, late = 0, soon = 0
    for (const g of groups) {
      const i = infos.get(g.key)!
      if (i.open.length > 0) openGroups++
      pendingValue += i.pendingValue
      late += i.late.length
      i.open.forEach((o) => {
        const d = daysToExpected(o)
        if (d !== null && d >= 0 && d <= 7) soon++
      })
    }
    return { openGroups, pendingValue, late, soon }
  }, [groups, infos])

  const tabDefs: { id: Tab; label: string; count: number; alert?: boolean; test: (g: OrderGroup) => boolean }[] = [
    { id: "open", label: "A receber", count: 0, test: (g) => infos.get(g.key)!.open.length > 0 },
    { id: "late", label: "Atrasados", count: 0, alert: true, test: (g) => infos.get(g.key)!.late.length > 0 },
    { id: "done", label: "Concluídos", count: 0, test: (g) => infos.get(g.key)!.open.length === 0 },
    { id: "all", label: "Todos", count: 0, test: () => true },
  ]
  tabDefs.forEach((t) => { t.count = groups.filter(t.test).length })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const test = tabDefs.find((t) => t.id === tab)!.test
    const list = groups.filter((g) => {
      if (filterSupplier !== "all" && g.supplierId !== filterSupplier) return false
      if (!test(g)) return false
      if (q) {
        const sup = supplierName(g.supplierId).toLowerCase()
        if (!sup.includes(q) && !g.orders.some((o) => o.productDescription.toLowerCase().includes(q))) return false
      }
      return true
    })
    return list.sort((a, b) => {
      const ia = infos.get(a.key)!, ib = infos.get(b.key)!
      const ao = ia.open.length > 0, bo = ib.open.length > 0
      if (ao !== bo) return ao ? -1 : 1
      if (ao) return (ia.nearest || "9999").localeCompare(ib.nearest || "9999")
      return String(b.createdAt).localeCompare(String(a.createdAt))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, infos, tab, filterSupplier, search, suppliers])

  // ── ações ──────────────────────────────────────────────────────────────────
  function sendWhatsApp(order: Order) {
    const supplier = suppliers.find((s) => s.id === order.supplierId)
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const label = linkedItem ? `${linkedCat?.name} → ${linkedItem.name}` : undefined
    openWhatsAppWeb(generateDeliveryMessage(order, supplier?.name || "Desconhecido", linkedItem?.unit, label))
  }

  async function handleCreate(list: Order[]) {
    try {
      await addOrders(list)
      toast.success(list.length === 1 ? "Pedido criado" : `Pedido criado com ${list.length} itens`)
      setCreateOpen(false)
      setTab("open")
    } catch (err) {
      console.error("Erro ao criar pedido", err)
      toast.error("Não foi possível criar o pedido")
    }
  }

  async function handleReceive(payload: ReceivePayload, onProgress: (done: number, total: number) => void) {
    let done = 0
    try {
      for (const it of payload.items) {
        // vínculo escolhido na hora de receber (pedido ainda sem item do estoque)
        if (it.createStockEntry && it.linkCategoryId && it.linkItemId &&
            (it.order.linkedCategoryId !== it.linkCategoryId || it.order.linkedItemId !== it.linkItemId)) {
          await updateOrder(it.order.id, { linkedCategoryId: it.linkCategoryId, linkedItemId: it.linkItemId })
        }
        await registerDelivery({
          orderId: it.order.id,
          deliveryDate: payload.deliveryDate,
          quantityDelivered: it.quantity,
          stockEntryQuantity: it.stockEntryQuantity,
          notes: payload.notes,
          createStockEntry: it.createStockEntry,
        })
        done++
        onProgress(done, payload.items.length)
      }
      const stock = payload.items.filter((i) => i.createStockEntry).length
      toast.success(
        `${done} ${done === 1 ? "recebimento registrado" : "recebimentos registrados"}` +
          (stock > 0 ? ` · ${stock} entrada${stock === 1 ? "" : "s"} lançada${stock === 1 ? "" : "s"} no estoque` : "")
      )
      setReceiveOrders(null)
    } catch (err) {
      console.error("Erro ao registrar recebimento", err)
      toast.error(
        done > 0
          ? `Registrei ${done} de ${payload.items.length} itens e parou num erro. Confira a lista antes de tentar de novo.`
          : "Não foi possível registrar o recebimento"
      )
      if (done > 0) setReceiveOrders(null)
    }
  }

  // ── linha de item ──────────────────────────────────────────────────────────
  function renderRow(order: Order) {
    const m = orderMetrics(order)
    const st = lineStatus(order)
    const Icon = KIND_ICON[st.kind]
    const unit = shortUnit(order.unit)
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const hasDeliveries = m.delivered > 0

    return (
      <div key={order.id} className={cn("grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5", ROW_GRID)}>
        <div className="col-span-2 min-w-0 md:col-span-1">
          <p className="break-words text-sm font-medium leading-snug">{order.productDescription}</p>
          {linkedItem && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {linkedCat?.name} → {linkedItem.name}
            </p>
          )}
        </div>

        <div>
          <span className="mb-0.5 block text-[11px] text-muted-foreground md:hidden">Pedido</span>
          <p className="text-sm font-medium tabular-nums">
            {fmtNum(m.ordered)} <span className="font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
        <div>
          <span className="mb-0.5 block text-[11px] text-muted-foreground md:hidden">Recebido</span>
          <p className="text-sm tabular-nums">
            {hasDeliveries ? (
              <>
                {fmtNum(m.delivered)} <span className="text-muted-foreground">{unit}</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>

        <div className="col-span-2 md:col-span-1">
          <Pill tone={st.tone} icon={Icon}>{st.label}</Pill>
          {st.sub && <p className="mt-0.5 pl-1 text-[11px] text-muted-foreground">{st.sub}</p>}
        </div>

        <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
          {m.open && (
            <Button size="sm" className="gap-1.5" onClick={() => setReceiveOrders([order])}>
              <Truck className="h-4 w-4" />
              {hasDeliveries ? "Receber resto" : "Receber"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {m.open && !hasDeliveries && (
                <DropdownMenuItem onClick={() => setEditOpen(order)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar item
                </DropdownMenuItem>
              )}
              {m.open && hasDeliveries && (
                <>
                  <DropdownMenuItem onClick={() => setEditDeliveryOpen(order)}>
                    <Pencil className="mr-2 h-4 w-4" /> Corrigir recebimento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFinalizeConfirm(order)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar (não vem mais nada)
                  </DropdownMenuItem>
                </>
              )}
              {order.deliveries && order.deliveries.length > 0 && (
                <DropdownMenuItem onClick={() => setDeliveryHistoryOpen(order)}>
                  <Clock className="mr-2 h-4 w-4" /> Ver recebimentos
                </DropdownMenuItem>
              )}
              {!m.open && order.stockEntryCreated && (
                <DropdownMenuItem onClick={() => sendWhatsApp(order)}>
                  <MessageCircle className="mr-2 h-4 w-4" /> Enviar no WhatsApp
                </DropdownMenuItem>
              )}
              {!m.open && (
                <DropdownMenuItem onClick={() => setRevertConfirm(order)}>
                  <Undo2 className="mr-2 h-4 w-4" /> Reabrir item
                </DropdownMenuItem>
              )}
              {m.open && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirm(order)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir item
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  // ── cartão de compra ───────────────────────────────────────────────────────
  function renderGroup(g: OrderGroup) {
    const info = infos.get(g.key)!
    const many = g.orders.length > 1
    const hasOpen = info.open.length > 0
    const isExpanded = search.trim() ? true : expanded[g.key] ?? (hasOpen || !many)

    // selo principal da compra
    let main: { label: string; tone: Tone; icon: typeof Clock }
    if (hasOpen) {
      const nearestOrder = info.open
        .filter((o) => o.expectedDate)
        .sort((a, b) => String(a.expectedDate).localeCompare(String(b.expectedDate)))[0]
      const a = arrivalLabel(nearestOrder ? daysToExpected(nearestOrder) : null)
      main = { label: a.label, tone: a.tone, icon: a.tone === "destructive" ? AlertTriangle : a.tone === "muted" ? Clock : Truck }
    } else {
      main = { label: many ? "Tudo recebido" : "Recebido", tone: "success", icon: CheckCircle2 }
    }
    const accent: Tone = info.late.length > 0 ? "destructive" : hasOpen ? main.tone : "success"
    const receivedCount = g.orders.length - info.open.length

    return (
      <Card key={g.key} className={cn("overflow-hidden border-l-4", TONE_ACCENT[accent])}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={!many}
            onClick={() => setExpanded((s) => ({ ...s, [g.key]: !isExpanded }))}
            className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", !many && "cursor-default")}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{supplierName(g.supplierId)}</span>
              <span className="block text-xs text-muted-foreground">
                Pedido de {fmtDate(g.createdAt)}
                {many && <> · {g.orders.length} itens{hasOpen ? ` · ${receivedCount} recebido${receivedCount === 1 ? "" : "s"}` : ""}</>}
                {info.nearest && hasOpen && <> · previsão {fmtDate(info.nearest)}</>}
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Pill tone={main.tone} icon={main.icon}>{main.label}</Pill>
            {many && info.open.length > 1 && (
              <Button size="sm" className="gap-1.5" onClick={() => setReceiveOrders(info.open)}>
                <Truck className="h-4 w-4" /> Receber itens ({info.open.length})
              </Button>
            )}
            {many && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={isExpanded ? "Recolher" : "Expandir"}
                onClick={() => setExpanded((s) => ({ ...s, [g.key]: !isExpanded }))}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
              </Button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t">
            <div className={cn("hidden gap-x-4 bg-muted/40 px-5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid", ROW_GRID)}>
              <span>Produto</span>
              <span>Pedido</span>
              <span>Recebido</span>
              <span>Situação</span>
              <span />
            </div>
            <div className="divide-y">{g.orders.map(renderRow)}</div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-5">
          <span>
            {g.orders.length} {g.orders.length === 1 ? "item" : "itens"}
            {info.singleUnit ? ` · ${fmtNum(info.totalQty)} ${info.singleUnit}` : ""}
          </span>
          <span className="tabular-nums">
            Valor <strong className="text-foreground">{fmtCurrency(info.totalValue)}</strong>
            {info.pendingValue > 0 && <> · a receber <strong className="text-foreground">{fmtCurrency(info.pendingValue)}</strong></>}
          </span>
        </div>
      </Card>
    )
  }

  const emptyText =
    tab === "late" ? "Nenhum pedido atrasado 🎉"
      : tab === "open" ? "Nada para receber no momento"
      : "Nenhum pedido encontrado"

  const hasAlerts = summary.late > 0 || summary.soon > 0

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
          <p className="text-sm text-muted-foreground">
            {summary.openGroups > 0
              ? <>{summary.openGroups} {summary.openGroups === 1 ? "compra em aberto" : "compras em aberto"} · <span className="font-medium text-foreground">{fmtCurrency(summary.pendingValue)}</span> a receber</>
              : "Tudo que foi comprado já chegou"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGeneralHistoryOpen(true)} className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo pedido
          </Button>
        </div>
      </div>

      {/* Avisos */}
      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Atenção</span>
          {summary.late > 0 && (
            <button type="button" onClick={() => setTab("late")}>
              <Pill tone="destructive" icon={AlertTriangle}>{summary.late} {summary.late === 1 ? "item atrasado" : "itens atrasados"}</Pill>
            </button>
          )}
          {summary.soon > 0 && (
            <button type="button" onClick={() => setTab("open")}>
              <Pill tone="warning" icon={Truck}>{summary.soon} {summary.soon === 1 ? "chega" : "chegam"} em até 7 dias</Pill>
            </button>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex rounded-lg bg-muted p-1">
            {tabDefs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "min-w-[1.25rem] rounded-full px-1.5 text-center text-xs tabular-nums",
                    t.alert && t.count > 0 ? "bg-destructive/15 text-destructive" : "bg-foreground/5"
                  )}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar produto ou fornecedor" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
            {search && (
              <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" onClick={() => setSearch("")}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os fornecedores</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
          <PackageCheck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{emptyText}</p>
        </Card>
      ) : (
        <div className="space-y-3">{filtered.map(renderGroup)}</div>
      )}
      {ordersHasMore && filtered.length > 0 && (
        <div className="flex justify-center">
          <Button
            onClick={async () => { setLoadingMore(true); await fetchMoreOrders(50, true); setLoadingMore(false) }}
            variant="outline"
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore ? "Carregando..." : <><ChevronDown className="h-4 w-4" />Carregar mais pedidos</>}
          </Button>
        </div>
      )}

      {/* Novo pedido (vários itens) */}
      {createOpen && (
        <OrderFormDialog
          open
          onOpenChange={(v) => !v && setCreateOpen(false)}
          suppliers={suppliers}
          categories={categories}
          onCreate={handleCreate}
          onUpdate={() => {}}
        />
      )}

      {/* Editar item */}
      {editOpen && (
        <OrderFormDialog
          open
          onOpenChange={(v) => !v && setEditOpen(null)}
          suppliers={suppliers}
          categories={categories}
          editingOrder={editOpen}
          onCreate={() => {}}
          onUpdate={async (order) => {
            await updateOrder(editOpen.id, order)
            toast.success("Item atualizado")
            setEditOpen(null)
          }}
        />
      )}

      {/* Receber */}
      {receiveOrders && (
        <ReceiveDialog
          open
          onOpenChange={(v) => !v && setReceiveOrders(null)}
          orders={receiveOrders}
          suppliers={suppliers}
          categories={categories}
          onConfirm={handleReceive}
        />
      )}

      {/* Corrigir recebimento */}
      {editDeliveryOpen && (
        <EditDeliveryDialog
          open={!!editDeliveryOpen}
          onOpenChange={(v) => !v && setEditDeliveryOpen(null)}
          order={editDeliveryOpen}
          categories={categories}
          onSave={async (params) => {
            try {
              await useStockStore.getState().updateDelivery({ orderId: editDeliveryOpen.id, ...params })
              toast.success("Recebimento atualizado" + (params.createStockEntry ? " e lançamento no estoque ajustado!" : ""))
              setEditDeliveryOpen(null)
            } catch (error) {
              console.error("Erro ao atualizar entrega", error)
              toast.error("Não foi possível salvar a alteração do recebimento")
            }
          }}
        />
      )}

      {deliveryHistoryOpen && (
        <DeliveryHistoryDialog
          open={!!deliveryHistoryOpen}
          onOpenChange={(v) => !v && setDeliveryHistoryOpen(null)}
          order={deliveryHistoryOpen}
        />
      )}

      <GeneralHistoryDialog
        open={generalHistoryOpen}
        onOpenChange={setGeneralHistoryOpen}
        orders={orders}
        suppliers={suppliers}
      />

      {/* Encerrar com saldo */}
      <AlertDialog open={!!finalizeConfirm} onOpenChange={(v) => !v && setFinalizeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar este item?</AlertDialogTitle>
            <AlertDialogDescription>
              {finalizeConfirm && (() => {
                const m = orderMetrics(finalizeConfirm)
                return m.pending > 0
                  ? `"${finalizeConfirm.productDescription}" será encerrado com ${fmtNum(m.delivered)} de ${fmtNum(m.ordered)} ${shortUnit(finalizeConfirm.unit)} — o que faltou fica só registrado no histórico.`
                  : `"${finalizeConfirm.productDescription}" será marcado como concluído.`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (finalizeConfirm) {
                  finalizeOrder(finalizeConfirm.id)
                  toast.success("Item encerrado")
                  setFinalizeConfirm(null)
                }
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reabrir */}
      <AlertDialog open={!!revertConfirm} onOpenChange={(v) => !v && setRevertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir este item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{revertConfirm?.productDescription}" volta para a lista "A receber". Os recebimentos já registrados e as
              entradas já lançadas no estoque não são alterados nem duplicados — só o status muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revertConfirm) {
                  revertOrder(revertConfirm.id)
                  toast.success("Item reaberto")
                  setRevertConfirm(null)
                }
              }}
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteConfirm?.productDescription}" será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  removeOrder(deleteConfirm.id)
                  toast.success("Item removido")
                  setDeleteConfirm(null)
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
