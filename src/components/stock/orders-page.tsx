
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
} from "lucide-react"
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

type FilterStatus = "all" | "pending" | "late" | "done"

export function OrdersPage() {
  const { suppliers, orders, categories, addOrder, updateOrder, removeOrder, registerDelivery, updateDelivery, finalizeOrder, fetchMoreOrders, ordersHasMore } =
    useStockStore() as StockState

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [filterSupplier, setFilterSupplier] = useState("all")
  const [loadingMore, setLoadingMore] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState<Order | null>(null)
  const [editDeliveryOpen, setEditDeliveryOpen] = useState<Order | null>(null)
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState<Order | null>(null)
  const [generalHistoryOpen, setGeneralHistoryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Order | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null)

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = orders.length
    const late = orders.filter((o) => o.deadlineStatus === "Pedido Atrasado").length
    const pending = orders.filter((o) => o.deliveryStatus === "Entrega Incompleta").length
    const done = orders.filter((o) => o.deliveryStatus === "Entrega Completa" || o.deliveryStatus === "Entrega Excedente").length
    return { total, late, pending, done }
  }, [orders])

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (filterSupplier !== "all" && o.supplierId !== filterSupplier) return false
        if (filterStatus === "pending" && o.deliveryStatus !== "Entrega Incompleta") return false
        if (filterStatus === "late" && o.deadlineStatus !== "Pedido Atrasado") return false
        if (filterStatus === "done" && o.deliveryStatus === "Entrega Incompleta") return false
        if (search) {
          const q = search.toLowerCase()
          const sup = suppliers.find((s) => s.id === o.supplierId)?.name.toLowerCase() || ""
          if (
            !o.productDescription.toLowerCase().includes(q) &&
            !sup.includes(q)
          )
            return false
        }
        return true
      })
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [orders, filterStatus, filterSupplier, search, suppliers])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pedidos de Matéria Prima</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe pedidos por fornecedor e registre entregas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setGeneralHistoryOpen(true)}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            Histórico Geral
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Novo Pedido
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: PackageCheck, color: "text-foreground" },
          { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-warning" },
          { label: "Atrasados", value: stats.late, icon: AlertTriangle, color: "text-destructive" },
          { label: "Concluídos", value: stats.done, icon: CheckCircle2, color: "text-success" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 py-3 flex items-center gap-3">
            <Icon className={cn("h-5 w-5 shrink-0", color)} />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-xl font-bold", color)}>{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto ou fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fornecedores</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-0.5">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "pending", label: "Pendentes" },
              { id: "late", label: "Atrasados" },
              { id: "done", label: "Concluídos" },
            ] as { id: FilterStatus; label: string }[]
          ).map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant={filterStatus === id ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setFilterStatus(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <PackageCheck className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum pedido encontrado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const supplier = suppliers.find((s) => s.id === order.supplierId)
            const quantityOrdered = order.quantityOrdered ?? 0
            const quantityDelivered = order.quantityDelivered ?? 0
            const pricePerUnit = order.pricePerUnit ?? 0
            const orderUnit = order.unit ||
              categories.find((c) => c.id === order.linkedCategoryId)
                ?.items.find((i) => i.id === order.linkedItemId)?.unit ||
              "kg"
            const toDeliver = quantityOrdered - quantityDelivered
            const totalValue =
              quantityDelivered * pricePerUnit ||
              quantityOrdered * pricePerUnit
            const linkedCat = categories.find(
              (c) => c.id === order.linkedCategoryId
            )
            const linkedItem = linkedCat?.items.find(
              (i) => i.id === order.linkedItemId
            )

            return (
              <Card
                key={order.id}
                className={cn(
                  "p-4 py-3 transition-colors",
                  order.deadlineStatus === "Pedido Atrasado" &&
                    order.deliveryStatus === "Entrega Incompleta" &&
                    "border-destructive/30 bg-destructive/[0.02]"
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {order.productDescription}
                      </span>
                      {deadlineBadge(order.deadlineStatus)}
                      {deliveryBadge(order.deliveryStatus)}
                      {order.stockEntryCreated && (
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Entrada lançada
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        <strong>Fornecedor:</strong>{" "}
                        {supplier?.name || "—"}
                      </span>
                      <span>
                        <strong>Pedido:</strong> {fmtDate(order.orderDate)}
                      </span>
                      <span>
                        <strong>Prev.:</strong> {fmtDate(order.expectedDate)}
                      </span>
                      {order.deliveryDate && (
                        <span>
                          <strong>Entrega:</strong>{" "}
                          {fmtDate(order.deliveryDate)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        <strong>Pedido:</strong>{" "}
                        {quantityOrdered.toLocaleString("pt-BR")} {orderUnit}
                      </span>
                      <span>
                        <strong>Entregue:</strong>{" "}
                        {quantityDelivered.toLocaleString("pt-BR")} {orderUnit}
                      </span>
                      {toDeliver > 0 && (
                        <span className="text-warning font-medium">
                          Falta: {toDeliver.toLocaleString("pt-BR")} {orderUnit}
                        </span>
                      )}
                      {order.stockEntryQuantity !== undefined &&
                        order.stockEntryQuantity > 0 && (
                          <span>
                            <strong>Entrada estoque:</strong>{" "}
                            {order.stockEntryQuantity} {linkedItem?.unit || "un"}
                          </span>
                        )}
                      <span>
                        <strong>Preço/{orderUnit}:</strong>{" "}
                        {pricePerUnit.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}
                      </span>
                      <span>
                        <strong>Total:</strong> {fmtCurrency(totalValue)}
                      </span>
                    </div>
                    {linkedItem && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Item no estoque:</strong> {linkedCat?.name} →{" "}
                        {linkedItem.name}
                      </p>
                    )}
                    {order.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        {order.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {order.deliveryStatus !== "Entrega Completa" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs border-success/40 text-success hover:bg-success/10"
                        onClick={() => setDeliveryOpen(order)}
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Registrar Entrega
                      </Button>
                    )}
                    {order.deliveryStatus === "Entrega Incompleta" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
                        onClick={() => {
                          finalizeOrder(order.id)
                          toast.success("Pedido finalizado")
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Finalizar Pedido
                      </Button>
                    )}
                    {order.deliveryDate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => setEditDeliveryOpen(order)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar Entrega
                      </Button>
                    )}
                    {order.deliveries && order.deliveries.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
                        onClick={() => setDeliveryHistoryOpen(order)}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Histórico
                      </Button>
                    )}
                    {order.stockEntryCreated && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs border-green-600/40 text-green-600 hover:bg-green-500/10"
                        onClick={() => {
                          const supplier = suppliers.find((s) => s.id === order.supplierId)
                          const linkedItem = categories
                            .find((c) => c.id === order.linkedCategoryId)
                            ?.items.find((i) => i.id === order.linkedItemId)
                          const message = generateDeliveryMessage(
                            order,
                            supplier?.name || "Desconhecido",
                            linkedItem?.unit
                          )
                          openWhatsAppWeb(message)
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditOpen(order)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(order)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {ordersHasMore && filtered.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={async () => {
              setLoadingMore(true)
              await fetchMoreOrders(50, true)
              setLoadingMore(false)
            }}
            variant="outline"
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore ? "⏳ Carregando mais..." : <><ChevronDown className="h-4 w-4" />Carregar mais pedidos</>}
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
          onSave={(params) => {
            updateDelivery({ orderId: editDeliveryOpen.id, ...params })
            toast.success("Entrega atualizada" + (params.createStockEntry ? " e lançamento no estoque ajustado!" : ""))
            setEditDeliveryOpen(null)
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
      deadlineStatus: expectedDate
        ? new Date() > new Date(expectedDate)
          ? "Pedido Atrasado"
          : "Dentro do Prazo"
        : "Dentro do Prazo",
      deliveryStatus: e?.deliveryStatus || "Entrega Incompleta",
      notes: notes.trim() || undefined,
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
      notes: notes.trim() || undefined,
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
