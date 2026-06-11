import { create } from "zustand"
import { supabase } from "./supabase"

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
  loading: boolean
  loadedWorkspaceId: string | null
  load: (workspaceId: string | null) => Promise<void>
  add: (s: Omit<Somatorio, "id" | "createdAt" | "updatedAt">) => Promise<string | null>
  update: (id: string, updates: Partial<Omit<Somatorio, "id" | "createdAt">>) => Promise<void>
  remove: (id: string) => Promise<void>
  getForWorkspace: (workspaceId: string | null) => Somatorio[]
}

function rowToSomatorio(r: any): Somatorio {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    unit: r.unit,
    itemRefs: Array.isArray(r.item_refs) ? r.item_refs : [],
    minQuantity: r.min_quantity == null ? null : Number(r.min_quantity),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export const useSomatoriosStore = create<SomatoriosState>()((set, get) => ({
  somatorios: [],
  loading: false,
  loadedWorkspaceId: null,

  load: async (workspaceId) => {
    if (!workspaceId) {
      set({ somatorios: [], loadedWorkspaceId: null })
      return
    }
    set({ loading: true })
    const { data, error } = await supabase
      .from("somatorios")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("[somatorios.load]", error)
      set({ loading: false })
      return
    }
    set({
      somatorios: (data || []).map(rowToSomatorio),
      loading: false,
      loadedWorkspaceId: workspaceId,
    })
  },

  add: async (s) => {
    if (!s.workspaceId) return null
    // 🔍 DIAGNÓSTICO TEMPORÁRIO — mostra o que o Supabase vê na sua sessão
    try {
      const { data: sess } = await supabase.auth.getSession()
      const { data: me } = await supabase
        .from("usuarios")
        .select("id, workspace_id")
        .eq("id", sess?.session?.user?.id ?? "")
        .maybeSingle()
      console.log("🔍 [somatorios.add] diag:", {
        sendingWorkspaceId: s.workspaceId,
        authUid: sess?.session?.user?.id ?? null,
        usuariosRow: me ?? null,
      })
    } catch (e) {
      console.log("🔍 [somatorios.add] diag error:", e)
    }
    const { data, error } = await supabase
      .from("somatorios")
      .insert({
        workspace_id: s.workspaceId,
        name: s.name,
        unit: s.unit,
        item_refs: s.itemRefs,
        min_quantity: s.minQuantity ?? null,
      })
      .select()
      .single()
    if (error || !data) {
      console.error("[somatorios.add]", error)
      throw new Error(error?.message || "Falha ao salvar somatório")
    }
    const row = rowToSomatorio(data)
    set({ somatorios: [...get().somatorios, row] })
    return row.id
  },

  update: async (id, updates) => {
    const patch: any = {}
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.unit !== undefined) patch.unit = updates.unit
    if (updates.itemRefs !== undefined) patch.item_refs = updates.itemRefs
    if (updates.minQuantity !== undefined) patch.min_quantity = updates.minQuantity
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("somatorios")
      .update(patch)
      .eq("id", id)
      .select()
      .single()
    if (error || !data) {
      console.error("[somatorios.update]", error)
      throw new Error(error?.message || "Falha ao atualizar somatório")
    }
    const row = rowToSomatorio(data)
    set({
      somatorios: get().somatorios.map((s) => (s.id === id ? row : s)),
    })
  },

  remove: async (id) => {
    const prev = get().somatorios
    set({ somatorios: prev.filter((s) => s.id !== id) })
    const { error } = await supabase.from("somatorios").delete().eq("id", id)
    if (error) {
      console.error("[somatorios.remove]", error)
      set({ somatorios: prev })
      throw new Error(error.message)
    }
  },

  getForWorkspace: (workspaceId) =>
    get().somatorios.filter((s) => s.workspaceId === workspaceId),
}))