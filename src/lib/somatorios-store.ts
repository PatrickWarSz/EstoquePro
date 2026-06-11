import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Somatorio {
  id: string
  workspaceId: string | null
  name: string
  unit: string                 // unidade exigida (todos os itens devem ter esta unit)
  itemRefs: string[]           // formato: `${categoryId}:${itemId}`
  minQuantity?: number | null  // alerta quando total <= min
  createdAt: string
  updatedAt: string
}

interface SomatoriosState {
  somatorios: Somatorio[]
  add: (s: Omit<Somatorio, "id" | "createdAt" | "updatedAt">) => string
  update: (id: string, updates: Partial<Omit<Somatorio, "id" | "createdAt">>) => void
  remove: (id: string) => void
  getForWorkspace: (workspaceId: string | null) => Somatorio[]
}

const genId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const useSomatoriosStore = create<SomatoriosState>()(
  persist(
    (set, get) => ({
      somatorios: [],
      add: (s) => {
        const now = new Date().toISOString()
        const id = genId()
        set({
          somatorios: [
            ...get().somatorios,
            { ...s, id, createdAt: now, updatedAt: now },
          ],
        })
        return id
      },
      update: (id, updates) => {
        const now = new Date().toISOString()
        set({
          somatorios: get().somatorios.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: now } : s,
          ),
        })
      },
      remove: (id) => {
        set({ somatorios: get().somatorios.filter((s) => s.id !== id) })
      },
      getForWorkspace: (workspaceId) =>
        get().somatorios.filter((s) => s.workspaceId === workspaceId),
    }),
    {
      name: "somatorios-local-v1",
      partialize: (state) => ({ somatorios: state.somatorios }),
    },
  ),
)