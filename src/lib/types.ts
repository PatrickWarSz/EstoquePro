export interface HistoryEntry {
  type: "entrada" | "saida"
  quantity: number
  date: string
  newTotal: number
  note?: string
  orderId?: string // reference to order if entry came from an order
  operatorId?: string
  operatorName?: string
}

export interface StockItem {
  id: string
  name: string
  quantity: number
  minQuantity: number
  unit: string
  supplierIds?: string[]
  history: HistoryEntry[]
  posicao?: number
}

export interface Category {
  id: string
  name: string
  unit?: string
  items: StockItem[]
  posicao?: number
}

export type StockStatus = "garantido" | "baixo" | "zerado"

// ── LOCATIONS (prateleiras / locais físicos) ───────────────
export interface StockLocation {
  id: string
  name: string
  description?: string
  // refs to items stored at this location: array of `${categoryId}:${itemId}`
  itemRefs: string[]
}

// ── SUPPLIERS ──────────────────────────────────────────────
export interface Supplier {
  id: string
  name: string
  contact?: string
  phone?: string
  email?: string
  notes?: string
}

// ── ORDERS ─────────────────────────────────────────────────
export type OrderDeliveryStatus =
  | "Entrega Incompleta"
  | "Entrega Completa"
  | "Entrega Excedente"

export type OrderDeadlineStatus =
  | "Dentro do Prazo"
  | "Pedido Atrasado"
  | "Entregue no Prazo"

export interface OrderDeliveryEntry {
  id: string
  date: string
  quantity: number
  stockEntryQuantity?: number
  notes?: string
  createStockEntry: boolean
}

export interface Order {
  id: string
  supplierId: string
  // Product description (free text, e.g. "Suplex Preto 165cm 300g")
  productDescription: string
  // Link to stock item (optional — set when creating/editing)
  linkedCategoryId?: string
  linkedItemId?: string

  // Dates
  orderDate: string       // ISO string
  expectedDate?: string   // ISO string
  deliveryDate?: string   // ISO string

  // Quantities
  quantityOrdered: number
  quantityDelivered: number
  quantityReturned: number

  // Quantity recorded in stock from this order delivery
  stockEntryQuantity?: number

  // Unit + pricing
  unit?: string
  pricePerUnit: number
  // totalValue = quantityDelivered * pricePerUnit (calculated)

  // Status — auto-calculated but stored for display
  deadlineStatus: OrderDeadlineStatus
  deliveryStatus: OrderDeliveryStatus

  notes?: string

  // Whether the stock entry has already been generated from this order
  stockEntryCreated: boolean

  // History of partial deliveries
  deliveries: OrderDeliveryEntry[]
}
