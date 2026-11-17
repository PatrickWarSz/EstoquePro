
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
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { formatQuantity, pluralizeUnit } from "@/lib/units"
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

const UNIT_SUGGESTIONS = ["kg", "rolo", "un", "m", "caixa", "metro", "litro"]

function deadlineBadge(status: Order["deadlineStatus"]) {
  if (status === "Entregue no Prazo")
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Entregue no Prazo
      </Badge>
    )
  if (status === "Pedido Atrasado")
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive gap-1">
        <AlertTriangle className="h-3 w-3" />
        Atrasado
      </Badge>
    )
  if (status === "Entregue com Atraso")
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive gap-1">
        <AlertTriangle className="h-3 w-3" />
        Entregue com Atraso
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning gap-1">
      <Clock className="h-3 w-3" />
      Dentro do Prazo
    </Badge>
  )
}

function deliveryBadge(status: Order["deliveryStatus"]) {
  if (status === "Entrega Completa")
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
        Completa
      </Badge>
    )
  if (status === "Entrega Excedente")
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-xs">
        Excedente
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning text-xs">
      Incompleta
    </Badge>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

type FilterStatus = "open" | "late" | "done" | "all"

function daysBetween(fromYmd: string, toYmd: string) {
  const a = new Date(fromYmd + "T00:00:00Z").getTime()
  const b = new Date(toYmd + "T00:00:00Z").getTime()
  return Math.round((b - a) / 86400000)
}

/** Um único selo por pedido, dizendo o que importa agora. */
function statusChip(order: Order) {
  const done = order.deliveryStatus !== "Entrega Incompleta"
  const expected = order.expectedDate ? String(order.expectedDate).slice(0, 10) : ""
  if (done) {
    const late = getDeadlineStatus(order.expectedDate, order.deliveryDate) === "Entregue com Atraso"
    return late
      ? { label: "Recebido com atraso", tone: "muted" as const, icon: CheckCircle2 }
      : { label: "Recebido", tone: "success" as const, icon: CheckCircle2 }
  }
  if (!expected) return { label: "Sem previsão", tone: "muted" as const, icon: Clock }
  const diff = daysBetween(todayDateInputValue(), expected)
  if (diff < 0) {
    const d = Math.abs(diff)
    return { label: `Atrasado ${d} ${d === 1 ? "dia" : "dias"}`, tone: "destructive" as const, icon: AlertTriangle }
  }
  if (diff === 0) return { label: "Chega hoje", tone: "warning" as const, icon: Truck }
  if (diff === 1) return { label: "Chega amanhã", tone: "warning" as const, icon: Truck }
  if (diff <= 7) return { label: `Chega em ${diff} dias`, tone: "warning" as const, icon: Truck }
  return { label: `Chega em ${diff} dias`, tone: "primary" as const, icon: Clock }
}

const toneClass = {
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  primary: "border-primary/30 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
}

export function OrdersPage() {
  const { suppliers, orders, categories, addOrder, updateOrder, removeOrder, registerDelivery, updateDelivery, finalizeOrder, revertOrder, fetchMoreOrders, ordersHasMore } =
    useStockStore() as StockState

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("open")
  const [filterSupplier, setFilterSupplier] = useState("all")
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState<Order | null>(null)
  const [editDeliveryOpen, setEditDeliveryOpen] = useState<Order | null>(null)
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState<Order | null>(null)
  const [generalHistoryOpen, setGeneralHistoryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Order | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null)
  const [revertConfirm, setRevertConfirm] = useState<Order | null>(null)

  const isOpen = (o: Order) => o.deliveryStatus === "Entrega Incompleta"
  const isLate = (o: Order) => isOpen(o) && getDeadlineStatus(o.expectedDate, o.deliveryDate) === "Pedido Atrasado"

  const stats = useMemo(() => ({
    total: orders.length,
    open: orders.filter(isOpen).length,
    late: orders.filter(isLate).length,
    done: orders.filter((o) => !isOpen(o)).length,
  }), [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = orders.filter((o) => {
      if (filterSupplier !== "all" && o.supplierId !== filterSupplier) return false
      if (filterStatus === "open" && !isOpen(o)) return false
      if (filterStatus === "late" && !isLate(o)) return false
      if (filterStatus === "done" && isOpen(o)) return false
      if (q) {
        const sup = suppliers.find((s) => s.id === o.supplierId)?.name.toLowerCase() || ""
        if (!o.productDescription.toLowerCase().includes(q) && !sup.includes(q)) return false
      }
      return true
    })
    // Abertos: atrasados primeiro, depois quem chega antes. Concluídos: mais recentes primeiro.
    return list.sort((a, b) => {
      const ao = isOpen(a), bo = isOpen(b)
      if (ao !== bo) return ao ? -1 : 1
      if (ao) {
        const ea = a.expectedDate ? String(a.expectedDate).slice(0, 10) : "9999"
        const eb = b.expectedDate ? String(b.expectedDate).slice(0, 10) : "9999"
        return ea.localeCompare(eb)
      }
      return new Date(b.deliveryDate || b.orderDate).getTime() - new Date(a.deliveryDate || a.orderDate).getTime()
    })
  }, [orders, filterStatus, filterSupplier, search, suppliers])

  function sendWhatsApp(order: Order) {
    const supplier = suppliers.find((s) => s.id === order.supplierId)
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const linkedItemLabel = linkedItem ? `${linkedCat?.name} → ${linkedItem.name}` : undefined
    openWhatsAppWeb(generateDeliveryMessage(order, supplier?.name || "Desconhecido", linkedItem?.unit, linkedItemLabel))
  }

  function renderOrderCard(order: Order) {
    const supplier = suppliers.find((s) => s.id === order.supplierId)
    const quantityOrdered = order.quantityOrdered ?? 0
    const quantityDelivered = order.quantityDelivered ?? 0
    const pricePerUnit = order.pricePerUnit ?? 0
    const linkedCat = categories.find((c) => c.id === order.linkedCategoryId)
    const linkedItem = linkedCat?.items.find((i) => i.id === order.linkedItemId)
    const orderUnit = order.unit || linkedItem?.unit || "kg"
    const toDeliver = Math.max(0, quantityOrdered - quantityDelivered)
    const totalValue = (quantityDelivered || quantityOrdered) * pricePerUnit
    const pct = quantityOrdered > 0 ? Math.min(100, (quantityDelivered / quantityOrdered) * 100) : 0
    const open = isOpen(order)
    const hasDeliveries = quantityDelivered > 0
    const chip = statusChip(order)
    const ChipIcon = chip.icon
    const showDetails = !!expanded[order.id]

    return (
      <Card
        key={order.id}
        className={cn(
          "overflow-hidden border-l-4 p-4",
          chip.tone === "destructive" ? "border-l-destructive"
            : chip.tone === "warning" ? "border-l-warning"
            : chip.tone === "success" ? "border-l-success"
            : chip.tone === "primary" ? "border-l-primary"
            : "border-l-border"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold leading-snug">{order.productDescription}</p>
            <p className="mt-0.5 text-sm text-muted-foreground break-words">
              {supplier?.name || "Sem fornecedor"}
              {open
                ? <> · previsão {fmtDate(order.expectedDate)}</>
                : order.deliveryDate ? <> · recebido em {fmtDate(order.deliveryDate)}</> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", toneClass[chip.tone])}>
              <ChipIcon className="h-3 w-3" />
              {chip.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {open && !hasDeliveries && (
                  <DropdownMenuItem onClick={() => setEditOpen(order)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar pedido
                  </DropdownMenuItem>
                )}
                {open && hasDeliveries && (
                  <>
                    <DropdownMenuItem onClick={() => setEditDeliveryOpen(order)}>
                      <Pencil className="mr-2 h-4 w-4" /> Corrigir recebimento
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { finalizeOrder(order.id); toast.success("Pedido encerrado") }}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar (não vem mais nada)
                    </DropdownMenuItem>
                  </>
                )}
                {order.deliveries && order.deliveries.length > 0 && (
                  <DropdownMenuItem onClick={() => setDeliveryHistoryOpen(order)}>
                    <Clock className="mr-2 h-4 w-4" /> Ver recebimentos
                  </DropdownMenuItem>
                )}
                {!open && order.stockEntryCreated && (
                  <DropdownMenuItem onClick={() => sendWhatsApp(order)}>
                    <MessageCircle className="mr-2 h-4 w-4" /> Enviar no WhatsApp
                  </DropdownMenuItem>
                )}
                {!open && (
                  <DropdownMenuItem onClick={() => setRevertConfirm(order)}>
                    <Undo2 className="mr-2 h-4 w-4" /> Reabrir pedido
                  </DropdownMenuItem>
                )}
                {open && (
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

        {/* Progresso: chegou / pedido */}
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{quantityDelivered.toLocaleString("pt-BR")}</span>
              <span className="text-muted-foreground"> de {formatQuantity(quantityOrdered, orderUnit)} recebidos</span>
            </span>
            {open && toDeliver > 0 && (
              <span className="font-medium text-warning">Faltam {formatQuantity(toDeliver, orderUnit)}</span>
            )}
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {open ? (
            <Button className="gap-2" onClick={() => setDeliveryOpen(order)}>
              <Truck className="h-4 w-4" />
              {hasDeliveries ? "Receber o restante" : "Receber"}
            </Button>
          ) : order.stockEntryCreated ? (
            <Button variant="outline" className="gap-2" onClick={() => sendWhatsApp(order)}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 text-muted-foreground"
            onClick={() => setExpanded((s) => ({ ...s, [order.id]: !s[order.id] }))}
          >
            {showDetails ? "Menos detalhes" : "Detalhes"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
          </Button>
        </div>

        {showDetails && (
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Data do pedido</dt><dd>{fmtDate(order.orderDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Previsão</dt><dd>{fmtDate(order.expectedDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Preço por {pluralizeUnit(1, orderUnit)}</dt><dd className="tabular-nums">{fmtCurrency(pricePerUnit)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Valor total</dt><dd className="font-medium tabular-nums">{fmtCurrency(totalValue)}</dd></div>
            {linkedItem && (
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Item no estoque</dt><dd className="text-right break-words">{linkedCat?.name} → {linkedItem.name}</dd></div>
            )}
            {order.stockEntryCreated && (
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Entrada no estoque</dt><dd className="flex items-center gap-1 text-success"><PackageCheck className="h-4 w-4" />{order.stockEntryQuantity ? formatQuantity(order.stockEntryQuantity, linkedItem?.unit) : "lançada"}</dd></div>
            )}
            {order.notes && (
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Observações</dt><dd className="italic break-words">{order.notes}</dd></div>
            )}
          </dl>
        )}
      </Card>
    )
  }

  const tabs: { id: FilterStatus; label: string; count: number; tone: string }[] = [
    { id: "open", label: "A receber", count: stats.open, tone: "text-warning" },
    { id: "late", label: "Atrasados", count: stats.late, tone: "text-destructive" },
    { id: "done", label: "Recebidos", count: stats.done, tone: "text-success" },
    { id: "all", label: "Todos", count: stats.total, tone: "text-foreground" },
  ]

  const emptyText =
    filterStatus === "late" ? "Nenhum pedido atrasado"
      : filterStatus === "open" ? "Nada para receber no momento"
      : "Nenhum pedido encontrado"

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
          <p className="text-sm text-muted-foreground">O que foi comprado e o que falta chegar</p>
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

      {/* Abas com contagem */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilterStatus(t.id)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              filterStatus === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/50"
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", t.count > 0 ? t.tone : "text-muted-foreground")}>{t.count}</p>
          </button>
        ))}
      </div>

      {/* Busca e fornecedor */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar produto ou fornecedor" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          {search && (
            <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" onClick={() => setSearch("")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fornecedores</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
          <PackageCheck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{emptyText}</p>
        </Card>
      ) : (
        <div className="space-y-3">{filtered.map((order) => renderOrderCard(order))}</div>
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

      {/* Create Order Dialog */}
      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers}
        categories={categories}
        onSave={(order) => {
          addOrder(order)
          toast.success("Pedido criado com sucesso")
          setCreateOpen(false)
        }}
      />

      {/* Edit Order Dialog */}
      {editOpen && (
        <CreateOrderDialog
          open={!!editOpen}
          onOpenChange={(v) => !v && setEditOpen(null)}
          suppliers={suppliers}
          categories={categories}
          editingOrder={editOpen}
          onSave={(order) => {
            updateOrder(editOpen.id, order)
            toast.success("Pedido atualizado")
            setEditOpen(null)
          }}
        />
      )}

      {/* Register Delivery Dialog */}
      {deliveryOpen && (
        <RegisterDeliveryDialog
          open={!!deliveryOpen}
          onOpenChange={(v) => !v && setDeliveryOpen(null)}
          order={deliveryOpen}
          categories={categories}
          suppliers={suppliers}
          onSave={(params) => {
            registerDelivery({ orderId: deliveryOpen.id, ...params })
            toast.success("Entrega registrada" + (params.createStockEntry ? " e entrada lançada no estoque!" : ""))
            setDeliveryOpen(null)
          }}
        />
      )}

      {/* Edit Delivery Dialog */}
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

      {/* Delivery History Dialog */}
      {deliveryHistoryOpen && (
        <DeliveryHistoryDialog
          open={!!deliveryHistoryOpen}
          onOpenChange={(v) => !v && setDeliveryHistoryOpen(null)}
          order={deliveryHistoryOpen}
        />
      )}

      {/* General History Dialog */}
      <GeneralHistoryDialog
        open={generalHistoryOpen}
        onOpenChange={setGeneralHistoryOpen}
        orders={orders}
        suppliers={suppliers}
      />

      {/* Revert confirm */}
      <AlertDialog
        open={!!revertConfirm}
        onOpenChange={(v) => !v && setRevertConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido "{revertConfirm?.productDescription}" voltará a aparecer
              como em andamento, liberando os botões de Registrar Entrega,
              Editar Entrega e Finalizar Pedido novamente. As entregas já
              registradas e as entradas já lançadas no estoque não são
              alteradas nem duplicadas — só o status do pedido muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revertConfirm) {
                  revertOrder(revertConfirm.id)
                  toast.success("Pedido revertido para Em andamento")
                  setRevertConfirm(null)
                }
              }}
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => !v && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido de "{deleteConfirm?.productDescription}" será removido
              permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  removeOrder(deleteConfirm.id)
                  toast.success("Pedido removido")
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

// ─── Create / Edit Order Dialog ──────────────────────────────────────────────

function CreateOrderDialog({
  open,
  onOpenChange,
  suppliers,
  categories,
  editingOrder,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  suppliers: Supplier[]
  categories: Category[]
  editingOrder?: Order
  onSave: (order: Order) => void
}) {
  const e = editingOrder
  const [supplierId, setSupplierId] = useState(e?.supplierId || "")
  const [productDescription, setProductDescription] = useState(e?.productDescription || "")
  const [orderDate, setOrderDate] = useState(dateInputValue(e?.orderDate))
  const [expectedDate, setExpectedDate] = useState(e?.expectedDate?.slice(0, 10) || "")
  const [quantityOrdered, setQuantityOrdered] = useState(e?.quantityOrdered?.toString() || "")
  const [pricePerUnit, setPricePerUnit] = useState(e?.pricePerUnit?.toString() || "")
  const [unit, setUnit] = useState(e?.unit || "kg")
  const [linkedCategoryId, setLinkedCategoryId] = useState(e?.linkedCategoryId || "")
  const [linkedItemId, setLinkedItemId] = useState(e?.linkedItemId || "")
  const [notes, setNotes] = useState(e?.notes || "")

  const linkedCatItems =
    categories.find((c: Category) => c.id === linkedCategoryId)?.items || []

  const handleSave = () => {
    if (!supplierId) { toast.error("Selecione o fornecedor"); return }
    if (!productDescription.trim()) { toast.error("Informe o produto"); return }
    if (!quantityOrdered || isNaN(Number(quantityOrdered))) { toast.error(`Informe a quantidade pedida em ${unit}`); return }
    if (!pricePerUnit || isNaN(Number(pricePerUnit))) { toast.error(`Informe o preço por ${unit}`); return }
    if (!unit.trim()) { toast.error("Informe a unidade de medida"); return }

    const order: Order = {
      id: e?.id || crypto.randomUUID(),
      supplierId,
      productDescription: productDescription.trim(),
      linkedCategoryId: linkedCategoryId || undefined,
      linkedItemId: linkedItemId || undefined,
      orderDate: dateInputToIso(orderDate),
      expectedDate: expectedDate ? dateInputToIso(expectedDate) : undefined,
      deliveryDate: e?.deliveryDate,
      quantityOrdered: Number(quantityOrdered),
      quantityDelivered: e?.quantityDelivered || 0,
      quantityReturned: e?.quantityReturned || 0,
      stockEntryQuantity: e?.stockEntryQuantity,
      unit: unit.trim(),
      pricePerUnit: Number(pricePerUnit),
      deadlineStatus: getDeadlineStatus(expectedDate ? dateInputToIso(expectedDate) : undefined, e?.deliveryDate),
      deliveryStatus: e?.deliveryStatus || "Entrega Incompleta",
      notes: notes.trim(),
      stockEntryCreated: e?.stockEntryCreated || false,
      deliveries: e?.deliveries || [],
    }
    onSave(order)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{e ? "Editar Pedido" : "Novo Pedido"}</DialogTitle>
          <DialogDescription>
            Registre um pedido de matéria prima
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-1">
          <div className="space-y-4 px-1 py-2">
            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: Supplier) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum fornecedor cadastrado. Use o botão "Fornecedores" no cabeçalho para cadastrar.
                </p>
              )}
            </div>

            {/* Product */}
            <div className="space-y-1.5">
              <Label>Produto / Descrição *</Label>
              <Input
                placeholder="Ex: Suplex Poliéster PRETO 165cm 300g"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data do Pedido *</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data Prevista de Entrega</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* Quantities */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Quantidade Pedida *</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 800"
                    inputMode="decimal"
                    value={quantityOrdered}
                    onChange={(e) => setQuantityOrdered(e.target.value)}
                  />
                  <Input
                    className="w-[80px]"
                    type="text"
                    placeholder="kg"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sugestões de unidade: {UNIT_SUGGESTIONS.join(" · ")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Preço por {unit || "unidade"} (R$) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="Ex: 0.0965"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                />
              </div>
            </div>

            {/* Estimated total */}
            {quantityOrdered && pricePerUnit && (
              <p className="text-sm text-muted-foreground">
                Valor estimado: {" "}
                <strong className="text-foreground">
                  {(Number(quantityOrdered) * Number(pricePerUnit)).toLocaleString(
                    "pt-BR",
                    { style: "currency", currency: "BRL" }
                  )}
                </strong>
              </p>
            )}

            {/* Link to stock item */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vincular ao Item do Estoque (para entrada automática)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={linkedCategoryId || "_none"}
                    onValueChange={(v) => {
                      const nextCategoryId = v === "_none" ? "" : v
                      setLinkedCategoryId(nextCategoryId)
                      setLinkedItemId("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhuma</SelectItem>
                      {categories.map((c: Category) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Item</Label>
                  <Select
                    value={linkedItemId || "_none"}
                    onValueChange={(v) => {
                      const nextItemId = v === "_none" ? "" : v
                      setLinkedItemId(nextItemId)
                    }}
                    disabled={!linkedCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {linkedCatItems.map((i: StockItem) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkedItemId && (
                    <p className="text-xs text-muted-foreground">
                      Unidade do item: {linkedCatItems.find((i: StockItem) => i.id === linkedItemId)?.unit || unit || "kg"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                placeholder="Ex: Prazo 30/60/90/120 dias"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>{e ? "Salvar Alterações" : "Criar Pedido"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Register Delivery Dialog ────────────────────────────────────────────────

function RegisterDeliveryDialog({
  open,
  onOpenChange,
  order,
  categories,
  suppliers,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  order: Order
  categories: Category[]
  suppliers: Supplier[]
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
  const [deliveryDate, setDeliveryDate] = useState(todayDateInputValue())
  const [delivered, setDelivered] = useState("")
  const [stockEntryQuantity, setStockEntryQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [createEntry, setCreateEntry] = useState(true)
  const [linkedCategoryId, setLinkedCategoryId] = useState(order.linkedCategoryId || "")
  const [linkedItemId, setLinkedItemId] = useState(order.linkedItemId || "")

  const linkedCatItems =
    categories.find((c: Category) => c.id === linkedCategoryId)?.items || []
  const linkedItem = linkedCatItems.find((item) => item.id === linkedItemId)

  const canCreateEntry =
    createEntry &&
    !!linkedCategoryId &&
    !!linkedItemId &&
    !!stockEntryQuantity &&
    Number(stockEntryQuantity) > 0

  const handleSave = () => {
    if (!delivered || isNaN(Number(delivered)) || Number(delivered) <= 0) {
      toast.error(`Informe a quantidade entregue em ${order.unit || "kg"}`)
      return
    }
    if (createEntry && (!linkedCategoryId || !linkedItemId)) {
      toast.error("Para lançar entrada no estoque, vincule uma categoria e item")
      return
    }
    if (createEntry && (!stockEntryQuantity || Number(stockEntryQuantity) <= 0)) {
      toast.error("Para lançar entrada no estoque, informe a quantidade de entrada no estoque")
      return
    }

    onSave({
      deliveryDate: dateInputToIso(deliveryDate),
      quantityDelivered: Number(delivered),
      stockEntryQuantity: stockEntryQuantity ? Number(stockEntryQuantity) : undefined,
      notes: notes.trim() || undefined,
      createStockEntry: canCreateEntry,
      linkedCategoryId: linkedCategoryId || undefined,
      linkedItemId: linkedItemId || undefined,
    })
  }

  const toDeliver = order.quantityOrdered - order.quantityDelivered

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-success" />
            Registrar Entrega
          </DialogTitle>
          <DialogDescription>{order.productDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {toDeliver > 0 && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Saldo a entregar:{" "}
              <strong className="text-foreground">
                {toDeliver.toLocaleString("pt-BR")} {order.unit || "kg"}
              </strong>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Data de Entrega *</Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade Entregue ({order.unit || "kg"}) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={toDeliver.toString()}
                value={delivered}
                onChange={(e) => setDelivered(e.target.value)}

              />
            </div>
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
          </div>

          {/* Stock entry section */}
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

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Truck className="h-4 w-4" />
            Confirmar Entrega
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
