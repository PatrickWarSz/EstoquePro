
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, StockItem, HistoryEntry, Supplier, Order, OrderDeliveryEntry, StockLocation } from './types'

// Gerador de ID à prova de falhas (funciona em qualquer navegador)
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36)

// ── Status helpers ───────────────────────────────────────────
function calcDeadlineStatus(
  expectedDate: string | undefined,
  deliveryDate: string | undefined,
): import('./types').OrderDeadlineStatus {
  const now = new Date()
  if (deliveryDate && expectedDate) {
    return new Date(deliveryDate) <= new Date(expectedDate)
      ? 'Entregue no Prazo'
      : 'Entregue no Prazo'
  }
  if (!expectedDate) return 'Dentro do Prazo'
  return now > new Date(expectedDate) ? 'Pedido Atrasado' : 'Dentro do Prazo'
}

function calcDeliveryStatus(
  ordered: number,
  delivered: number,
): import('./types').OrderDeliveryStatus {
  if (delivered <= 0) return 'Entrega Incompleta'
  if (delivered < ordered) return 'Entrega Incompleta'
  if (delivered > ordered) return 'Entrega Excedente'
  return 'Entrega Completa'
}

// ── Interface do store ───────────────────────────────────────
export interface StockState {
  categories: Category[]
  selectedCategoryId: string | null
  suppliers: Supplier[]
  orders: Order[]
  locations: StockLocation[]
  loading: boolean
  clientId: string | null

  initialize: () => Promise<void>
  setSelectedCategory: (id: string) => void

  addItem: (categoryId: string, item: Omit<StockItem, 'history'>) => Promise<void>
  removeItem: (categoryId: string, itemId: string) => Promise<void>
  updateItem: (categoryId: string, itemId: string, updates: Partial<Omit<StockItem, 'id' | 'history'>>) => Promise<void>
  updateItemQuantity: (categoryId: string, itemId: string, newQuantity: number, type: 'entrada' | 'saida', movementQty: number, note?: string, orderId?: string) => Promise<void>

  addCategory: (category: Omit<Category, 'items'> & { items?: StockItem[] }) => Promise<void>
  updateCategory: (categoryId: string, name: string) => Promise<void>
  removeCategory: (categoryId: string) => Promise<void>

  clearHistory: () => Promise<void>

  addSupplier: (supplier: Omit<Supplier, 'id'> & { id?: string }) => Promise<void>
  updateSupplier: (supplierId: string, updates: Partial<Omit<Supplier, 'id'>>) => Promise<void>
  removeSupplier: (supplierId: string) => Promise<void>

  addOrder: (order: Omit<Order, 'deliveries'>) => Promise<void>
  updateOrder: (orderId: string, updates: Partial<Omit<Order, 'id'>>) => Promise<void>
  removeOrder: (orderId: string) => Promise<void>
  registerDelivery: (params: { orderId: string, deliveryDate: string, quantityDelivered: number, stockEntryQuantity?: number, notes?: string, createStockEntry: boolean }) => Promise<void>
  updateDelivery: (params: { orderId: string, deliveryDate: string, quantityDelivered: number, stockEntryQuantity?: number, notes?: string, createStockEntry: boolean }) => Promise<void>
  finalizeOrder: (orderId: string) => Promise<void>

  addLocation: (location: Omit<StockLocation, 'id' | 'itemRefs'> & { itemRefs?: string[] }) => Promise<string>
  updateLocation: (locationId: string, updates: Partial<Omit<StockLocation, 'id'>>) => Promise<void>
  removeLocation: (locationId: string) => Promise<void>
  toggleLocationItem: (locationId: string, ref: string) => Promise<void>
}

// ── Store ────────────────────────────────────────────────────
export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      categories: [],
      selectedCategoryId: null,
      suppliers: [],
      orders: [],
      locations: [],
      loading: false,
      clientId: 'local-user',

      initialize: async () => {
        set({ loading: false })
      },

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      // ── Items ─────────────────────────────────────────────────
      addItem: async (categoryId, item) => {
        const newItem: StockItem = {
          ...item,
          id: generateId(),
          history: [],
          supplierIds: item.supplierIds || []
        }
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === categoryId ? { ...cat, items: [...cat.items, newItem] } : cat
          ),
        }))
      },

      removeItem: async (categoryId, itemId) => {
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === categoryId
              ? { ...cat, items: cat.items.filter((i) => i.id !== itemId) }
              : cat
          ),
        }))
      },

      updateItem: async (categoryId, itemId, updates) => {
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === categoryId
              ? {
                  ...cat,
                  items: cat.items.map((item) =>
                    item.id === itemId ? { ...item, ...updates } : item
                  ),
                }
              : cat
          ),
        }))
      },

      updateItemQuantity: async (categoryId, itemId, newQuantity, type, movementQty, note, orderId) => {
        const newEntry: HistoryEntry = {
          type,
          quantity: movementQty,
          date: new Date().toISOString(),
          newTotal: newQuantity,
          note,
          orderId,
        }

        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === categoryId
              ? {
                  ...cat,
                  items: cat.items.map((item) =>
                    item.id === itemId
                      ? { ...item, quantity: newQuantity, history: [...item.history, newEntry] }
                      : item
                  ),
                }
              : cat
          ),
        }))
      },

      // ── Categories ────────────────────────────────────────────
      addCategory: async (category) => {
        const newCategory: Category = {
          ...category,
          id: generateId(),
          items: []
        }
        set((state) => ({
          categories: [...state.categories, newCategory],
          selectedCategoryId: state.selectedCategoryId || newCategory.id,
        }))
      },

      updateCategory: async (categoryId, name) => {
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === categoryId ? { ...cat, name } : cat
          ),
        }))
      },

      removeCategory: async (categoryId) => {
        set((state) => {
          const newCategories = state.categories.filter((c) => c.id !== categoryId)
          return {
            categories: newCategories,
            selectedCategoryId: state.selectedCategoryId === categoryId ? newCategories[0]?.id || null : state.selectedCategoryId,
          }
        })
      },

      // ── History ───────────────────────────────────────────────
      clearHistory: async () => {
        set((state) => ({
          categories: state.categories.map((cat) => ({
            ...cat,
            items: cat.items.map((item) => ({ ...item, history: [] })),
          })),
        }))
      },

      // ── Suppliers ─────────────────────────────────────────────
      addSupplier: async (supplier) => {
        const newSupplier: Supplier = { ...supplier, id: generateId() }
        set((state) => ({ suppliers: [...state.suppliers, newSupplier] }))
      },

      updateSupplier: async (supplierId, updates) => {
        set((state) => ({
          suppliers: state.suppliers.map((s) => (s.id === supplierId ? { ...s, ...updates } : s)),
        }))
      },

      removeSupplier: async (supplierId) => {
        set((state) => ({
          suppliers: state.suppliers.filter((s) => s.id !== supplierId),
        }))
      },

      // ── Orders ────────────────────────────────────────────────
      addOrder: async (order) => {
        const newOrder: Order = {
          ...order,
          id: generateId(),
          deliveries: [],
        }
        set((state) => ({ orders: [newOrder, ...state.orders] }))
      },

      updateOrder: async (orderId, updates) => {
        set((state) => ({
          orders: state.orders.map((o) => (o.id === orderId ? { ...o, ...updates } : o)),
        }))
      },

      removeOrder: async (orderId) => {
        set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId) }))
      },

      registerDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry }) => {
        set((state) => {
          const order = state.orders.find((o) => o.id === orderId)
          if (!order) return state

          const totalDelivered = order.quantityDelivered + quantityDelivered
          const deadlineStatus = calcDeadlineStatus(order.expectedDate, deliveryDate)
          const deliveryStatus = calcDeliveryStatus(order.quantityOrdered, totalDelivered)

          const newDelivery: OrderDeliveryEntry = {
            id: generateId(),
            date: deliveryDate,
            quantity: quantityDelivered,
            stockEntryQuantity: stockEntryQuantity,
            notes,
            createStockEntry
          }

          const updatedOrder = {
            ...order,
            deliveries: [...order.deliveries, newDelivery],
            deliveryDate,
            quantityDelivered: totalDelivered,
            stockEntryQuantity: (order.stockEntryQuantity || 0) + (stockEntryQuantity || 0),
            deadlineStatus,
            deliveryStatus,
            notes: notes ?? order.notes,
            stockEntryCreated: createStockEntry ? true : order.stockEntryCreated
          }

          let newCategories = state.categories

          if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity && stockEntryQuantity > 0) {
            newCategories = newCategories.map((cat) => {
              if (cat.id !== order.linkedCategoryId) return cat
              return {
                ...cat,
                items: cat.items.map((item) => {
                  if (item.id !== order.linkedItemId) return item
                  const newQty = item.quantity + stockEntryQuantity
                  const histEntry: HistoryEntry = {
                    type: 'entrada',
                    quantity: stockEntryQuantity,
                    newTotal: newQty,
                    note: `Pedido #${orderId.slice(-6).toUpperCase()} — ${quantityDelivered} ${order.unit || 'un'} entregues`,
                    orderId,
                    date: new Date().toISOString()
                  }
                  return { ...item, quantity: newQty, history: [...item.history, histEntry] }
                })
              }
            })
          }

          return {
            orders: state.orders.map(o => o.id === orderId ? updatedOrder : o),
            categories: newCategories
          }
        })
      },

      updateDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry }) => {
        set((state) => {
          const order = state.orders.find((o) => o.id === orderId)
          if (!order) return state

          const deadlineStatus = calcDeadlineStatus(order.expectedDate, deliveryDate)
          const deliveryStatus = calcDeliveryStatus(order.quantityOrdered, quantityDelivered)

          let newCategories = state.categories

          if (order.stockEntryCreated && order.stockEntryQuantity && order.linkedCategoryId && order.linkedItemId) {
            newCategories = newCategories.map(cat => {
              if (cat.id !== order.linkedCategoryId) return cat
              return {
                ...cat,
                items: cat.items.map(item => {
                  if (item.id !== order.linkedItemId) return item
                  const revertedQty = item.quantity - order.stockEntryQuantity!
                  const filteredHistory = item.history.filter(h => !(h.orderId === orderId && h.type === 'entrada'))
                  return { ...item, quantity: revertedQty, history: filteredHistory }
                })
              }
            })
          }

          const updatedOrder = {
            ...order,
            deliveryDate,
            quantityDelivered,
            stockEntryQuantity: stockEntryQuantity ?? 0,
            deadlineStatus,
            deliveryStatus,
            notes: notes ?? order.notes,
            stockEntryCreated: createStockEntry ? true : order.stockEntryCreated
          }

          if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity && stockEntryQuantity > 0) {
            newCategories = newCategories.map((cat) => {
              if (cat.id !== order.linkedCategoryId) return cat
              return {
                ...cat,
                items: cat.items.map((item) => {
                  if (item.id !== order.linkedItemId) return item
                  const newQty = item.quantity + stockEntryQuantity
                  const histEntry: HistoryEntry = {
                    type: 'entrada',
                    quantity: stockEntryQuantity,
                    newTotal: newQty,
                    note: `Pedido #${orderId.slice(-6).toUpperCase()} — ${quantityDelivered} ${order.unit || 'un'} entregues (editado)`,
                    orderId,
                    date: new Date().toISOString()
                  }
                  return { ...item, quantity: newQty, history: [...item.history, histEntry] }
                })
              }
            })
          }

          return {
            orders: state.orders.map(o => o.id === orderId ? updatedOrder : o),
            categories: newCategories
          }
        })
      },

      finalizeOrder: async (orderId) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, deliveryStatus: 'Entrega Completa' } : o
          ),
        }))
      },

      // ── Locations ─────────────────────────────────────────────
      addLocation: async (location) => {
        const newLocation: StockLocation = {
          id: generateId(),
          name: location.name,
          description: location.description,
          itemRefs: location.itemRefs || [],
        }
        set((state) => ({ locations: [...state.locations, newLocation] }))
        return newLocation.id
      },
      updateLocation: async (locationId, updates) => {
        set((state) => ({
          locations: state.locations.map((l) => (l.id === locationId ? { ...l, ...updates } : l)),
        }))
      },
      removeLocation: async (locationId) => {
        set((state) => ({ locations: state.locations.filter((l) => l.id !== locationId) }))
      },
      toggleLocationItem: async (locationId, ref) => {
        set((state) => ({
          locations: state.locations.map((l) => {
            if (l.id !== locationId) return l
            const has = l.itemRefs.includes(ref)
            return {
              ...l,
              itemRefs: has ? l.itemRefs.filter((r) => r !== ref) : [...l.itemRefs, ref],
            }
          }),
        }))
      },
    }),
    {
      // NOME NOVO PARA IGNORAR LIXO ANTIGO NO SEU NAVEGADOR E COMEÇAR FRESCO:
      name: 'estoque-local-v2', 
    }
  )
)
