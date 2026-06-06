import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, StockItem, HistoryEntry, Supplier, Order, OrderDeliveryEntry, StockLocation } from './types'
import { useAuthStore } from './auth-store'
import { toast } from "sonner"
import { enqueueOp as enqueueRawOp, flushOps, countOps, genTempId, isTempId, pruneTmpMap, resolveTempId, type OpType, type QueuedOp, type QueueScope } from './op-queue'

export type QrAlias = { kind: 'item'; categoryId: string; itemId: string } | { kind: 'location'; locationId: string }

// --- FUNÇÕES AUXILIARES ---
function getCurrentOperator(): { id?: string; name?: string } {
  try {
    const u = useAuthStore.getState().getCurrentUser()
    return u ? { id: u.id, name: u.name } : {}
  } catch { return {} }
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36)

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

function dateOnly(value?: string) {
  return value ? String(value).slice(0, 10) : '';
}

function todayDateOnly() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function calcDeadlineStatus(exp: string | undefined, del: string | undefined): import('./types').OrderDeadlineStatus {
  if (del && exp) return dateOnly(del) <= dateOnly(exp) ? 'Entregue no Prazo' : 'Entregue com Atraso'
  if (!exp) return 'Dentro do Prazo'
  return todayDateOnly() > dateOnly(exp) ? 'Pedido Atrasado' : 'Dentro do Prazo'
}

function calcDeliveryStatus(ord: number, del: number): import('./types').OrderDeliveryStatus {
  if (del <= 0) return 'Entrega Incompleta'
  if (del < ord) return 'Entrega Incompleta'
  return del > ord ? 'Entrega Excedente' : 'Entrega Completa'
}

function currentQueueScope(): QueueScope {
  const auth = useAuthStore.getState();
  return { workspaceId: auth.workspaceId, ownerUserId: auth.currentUserId, includeLegacy: false };
}

function enqueueOp(op: Omit<QueuedOp, "id" | "createdAt" | "attempts">): Promise<string> {
  return enqueueRawOp({ ...op, ownerUserId: useAuthStore.getState().currentUserId });
}

// --- CONTRATO DO SISTEMA (INTERFACE) ---
export interface StockState {
  categories: Category[];
  selectedCategoryId: string | null;
  suppliers: Supplier[];
  orders: Order[];
  locations: StockLocation[];
  loading: boolean;
  clientId: string | null;
  qrAliases: Record<string, QrAlias>;
  
  // Pagination state for large lists
  suppliersCursor: string | null;
  suppliersHasMore: boolean;
  ordersCursor: string | null;
  ordersHasMore: boolean;
  movimentacoesCursor: string | null;
  movimentacoesHasMore: boolean;
  fetchMoreHistory: (itemId?: string) => Promise<void>;
  
  initialize: () => Promise<void>;
  setSelectedCategory: (id: string) => void;
  addItem: (catId: string, item: Omit<StockItem, 'history'>) => Promise<void>;
  removeItem: (catId: string, itemId: string) => Promise<void>;
  updateItem: (catId: string, itemId: string, updates: Partial<StockItem>) => Promise<void>;
  updateItemQuantity: (catId: string, itemId: string, newQ: number, type: 'entrada' | 'saida', movQ: number, note?: string, orderId?: string) => Promise<void>;
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  reorderItems: (categoryId: string, orderedIds: string[]) => Promise<void>;
  clearHistory: () => Promise<void>;
  addSupplier: (s: any) => Promise<void>;
  updateSupplier: (id: string, up: any) => Promise<void>;
  removeSupplier: (id: string) => Promise<void>;
  addOrder: (o: any) => Promise<void>;
  updateOrder: (id: string, up: any) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  registerDelivery: (p: any) => Promise<void>;
  updateDelivery: (p: any) => Promise<void>;
  finalizeOrder: (id: string) => Promise<void>;
  addLocation: (l: any) => Promise<string>;
  updateLocation: (id: string, up: any) => Promise<void>;
  removeLocation: (id: string) => Promise<void>;
  toggleLocationItem: (id: string, ref: string) => Promise<void>;
  setQrAlias: (k: string, a: QrAlias) => Promise<void>;
  removeQrAlias: (k: string) => Promise<void>;
  syncPendingMovements: () => Promise<void>;
  pendingMovementsCount: () => Promise<number>;
  pendingOpsCount: () => Promise<number>;
  syncPendingOps: (manual?: boolean) => Promise<void>;
  applyBatchMovements: (moves: Array<{ categoryId: string; itemId: string; newQ: number; type: 'entrada' | 'saida'; movQ: number; note?: string; orderId?: string }>) => Promise<void>;
  
  // Pagination fetch functions
  fetchMoreSuppliers: (limit?: number, append?: boolean) => Promise<void>;
  fetchMoreOrders: (limit?: number, append?: boolean) => Promise<void>;
}

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
      qrAliases: {},
      
      // Pagination state
       suppliersCursor: null,
      suppliersHasMore: true,
      ordersCursor: null,
      ordersHasMore: true,
      movimentacoesCursor: null,
      movimentacoesHasMore: false,

      initialize: async () => {
        set({ loading: true });
        try {
          const { supabase } = await import('./supabase');
          const workspaceId = useAuthStore.getState().workspaceId;
          if (!workspaceId) { set({ loading: false }); return; }

          // OFFLINE: se o dispositivo está sem internet, NÃO bate no Supabase.
          // O zustand persist já reidratou categorias/pedidos/fornecedores/locations
          // do disco — usamos isso e tentamos sincronizar quando voltar online.
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.warn('[initialize] offline — usando cache local');
            set({ loading: false });
            try {
              window.addEventListener('online', () => { get().initialize(); }, { once: true });
            } catch (_) {}
            return;
          }

          // Garante que a sessão do Supabase está válida antes de consultar
          // (RLS retorna 0 linhas sem token — sem erro — e zeraria o estado).
          let { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            try {
              const { data } = await supabase.auth.refreshSession();
              session = data.session;
            } catch { /* ignore */ }
          }
          if (!session) {
            // Sem sessão: NÃO limpa o estado atual — apenas aborta e tenta de novo depois.
            console.warn('[initialize] sem sessão Supabase — abortando para preservar dados em cache');
            set({ loading: false });
            return;
          }

          // Migrate any old localStorage pending queue into IndexedDB before fetching remote data
          try { const { migrateFromLocalStorage } = await import('./idb-queue'); await migrateFromLocalStorage(); } catch(e) { /* ignore */ }

          const [catRes, prodRes, movRes, supRes, locRes, pedRes, entRes, qrRes] = await Promise.all([
            supabase.from('categorias').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
supabase.from('produtos').select('*').eq('workspace_id', workspaceId).is('deleted_at', null),
            supabase.from('movimentacoes').select('*').eq('workspace_id', workspaceId).order('data', { ascending: false }).limit(500),
            supabase.from('fornecedores').select('*').eq('workspace_id', workspaceId).order('criado_em', { ascending: false }).limit(30),
            supabase.from('locais_estoque').select('*').eq('workspace_id', workspaceId),
            supabase.from('pedidos').select('*').eq('workspace_id', workspaceId).order('criado_em', { ascending: false }).limit(50),
            supabase.from('entregas_pedido').select('*').eq('workspace_id', workspaceId),
            supabase.from('aliases_qr').select('*').eq('workspace_id', workspaceId)
          ]);

          const suppliers = (supRes.data || []).map(f => ({ id: f.id, name: f.nome, contact: f.contato || '', phone: f.telefone || '', email: f.email || '', notes: f.observacao || '', cnpj: f.cnpj || '' }));
          const locations = (locRes.data || []).map(l => ({ id: l.id, name: l.nome, description: l.descricao || '', itemRefs: l.item_refs ? JSON.parse(l.item_refs) : [] }));
          const qrAliases: Record<string, QrAlias> = {};
          (qrRes.data || []).forEach(qr => {
            if (qr.tipo === 'item') qrAliases[qr.chave] = { kind: 'item', categoryId: qr.categoria_id, itemId: qr.item_id };
            else if (qr.tipo === 'location') qrAliases[qr.chave] = { kind: 'location', locationId: qr.location_id };
          });

         const orders = (pedRes.data ||[]).map(p => {
             const ents = (entRes.data ||[]).filter(e => e.pedido_id === p.id).map(e => ({ id: e.id, date: e.data, quantity: Number(e.quantidade), stockEntryQuantity: Number(e.quantidade_estoque), notes: e.observacoes, createStockEntry: e.gerou_entrada_estoque })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
             const latestDeliveryDate = ents.length > 0 ? ents[0].date : undefined;
             const deadlineStatus = calcDeadlineStatus(p.data_esperada, latestDeliveryDate);
             return { 
               id: p.id, 
               supplierId: p.fornecedor_id, 
               linkedCategoryId: p.categoria_id, 
               linkedItemId: p.produto_id, 
               unit: p.unidade, 
               quantityOrdered: Number(p.quantidade_pedida), 
               quantityDelivered: Number(p.quantidade_entregue), 
               expectedDate: p.data_esperada, 
                deliveryDate: latestDeliveryDate, 
                deadlineStatus, 
               deliveryStatus: p.status_entrega as any, 
               notes: p.observacoes, 
               stockEntryCreated: p.entrada_estoque_criada, 
               stockEntryQuantity: Number(p.quantidade_estoque_gerada), 
               deliveries: ents,
               // NOVOS CAMPOS EXIGIDOS PELO LOVABLE PARA NÃO QUEBRAR A TELA:
               productDescription: p.descricao || p.produto_id || 'Pedido sem descrição',
orderDate: p.criado_em || new Date().toISOString(), 
quantityReturned: 0, 
pricePerUnit: Number(p.preco_por_unidade) || 0,
             };
          });

          let categories: Category[] = [];
          if (catRes.data) {
             const sortedCats = [...catRes.data].sort((a: any, b: any) => {
               const pa = a.posicao ?? 999999, pb = b.posicao ?? 999999;
               if (pa !== pb) return pa - pb;
               return (a.criado_em || '').localeCompare(b.criado_em || '');
             });
             const sortedProds = [...(prodRes.data || [])].sort((a: any, b: any) => {
               const pa = a.posicao ?? 999999, pb = b.posicao ?? 999999;
               if (pa !== pb) return pa - pb;
               return (a.criado_em || '').localeCompare(b.criado_em || '');
             });
categories = sortedCats.map(cat => ({
   id: cat.id, name: cat.nome, posicao: cat.posicao ?? 0,
   items: sortedProds.filter(pr => pr.categoria_id === cat.id).map(pr => ({
     id: pr.id, name: pr.nome, quantity: Number(pr.quantidade), minQuantity: Number(pr.estoque_minimo), unit: pr.unidade, categoryId: pr.categoria_id, supplierIds: pr.fornecedor_ids || [], posicao: pr.posicao ?? 0,
     history: (movRes.data || []).filter(m => m.produto_id === pr.id).map(m => ({ id: m.id, type: m.tipo as any, quantity: Number(m.quantidade), newTotal: Number(m.novo_total), date: m.data, note: m.observacao || '', orderId: m.pedido_id, operatorId: m.operador_id, operatorName: m.nome_operador || 'Sistema' }))
   }))
}));
          }
          // Preserve the user's currently selected category across periodic refreshes.
          const prevSelected = get().selectedCategoryId;
          const stillExists = prevSelected && categories.some(c => c.id === prevSelected);
          const nextSelected = stillExists ? prevSelected : (categories.length > 0 ? categories[0].id : null);
          set({ 
            categories, 
            suppliers, 
            locations, 
            orders, 
            qrAliases, 
            selectedCategoryId: nextSelected, 
            loading: false,
            suppliersCursor: supRes.data && supRes.data.length > 0 ? supRes.data[supRes.data.length - 1].criado_em : null,
            suppliersHasMore: (supRes.data || []).length === 30,
            ordersCursor: pedRes.data && pedRes.data.length > 0 ? pedRes.data[pedRes.data.length - 1].criado_em : null,
            ordersHasMore: (pedRes.data || []).length === 50,
            movimentacoesCursor: movRes.data && movRes.data.length > 0 ? movRes.data[movRes.data.length - 1].data : null,
            movimentacoesHasMore: (movRes.data || []).length === 500,
          });

          // Cache QR metadata for offline resolution
          try {
            const { cacheQrMetadata } = await import('./qr-cache');
            const itemsForCache = categories.flatMap(cat => 
              cat.items.map(item => ({
                id: item.id,
                name: item.name,
                categoryId: cat.id,
                categoryName: cat.name,
                unit: item.unit,
                minQuantity: item.minQuantity || 0
              }))
            );
            await cacheQrMetadata(workspaceId, itemsForCache, locations);
          } catch (err) {
            console.warn('[initialize] QR cache error (não crítico):', err);
          }

          // Sincronização de filas fica centralizada no AppLayout/modal para evitar tentativas duplicadas.
        } catch { set({ loading: false }); }
      },

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      addItem: async (catId, item) => {
        const wId = useAuthStore.getState().workspaceId;
        const cat = get().categories.find(c => c.id === catId);
        const maxPos = (cat?.items || []).reduce((m, it) => Math.max(m, it.posicao ?? 0), 0);
        const payload = { nome: item.name, quantidade: item.quantity, estoque_minimo: item.minQuantity || 0, unidade: item.unit || 'un', categoria_id: catId, workspace_id: wId, posicao: maxPos + 1 };

        if (isOffline()) {
          const tmpId = genTempId('item');
          // Otimista local
          set((state) => ({
            categories: state.categories.map(c => c.id !== catId ? c : ({
              ...c,
              items: [...c.items, { id: tmpId, name: item.name, quantity: item.quantity, minQuantity: item.minQuantity || 0, unit: item.unit || 'un', categoryId: catId, supplierIds: (item as any).supplierIds || [], posicao: maxPos + 1, history: [] }]
            }))
          }) as any);
          await enqueueOp({ type: 'item.add', payload, workspaceId: wId!, createsTempId: tmpId, refFields: ['categoria_id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          const { error } = await supabase.from('produtos').insert([payload]);
          if (error) throw error;
          await get().initialize();
        } catch (err) {
          await enqueueOp({ type: 'item.add', payload, workspaceId: wId!, createsTempId: genTempId('item'), refFields: ['categoria_id'] });
          toast.info('Sem conexão — item será criado quando voltar online');
        }
      },

      removeItem: async (catId, itemId) => {
        const wId = useAuthStore.getState().workspaceId;
        // Otimista local (remove da lista)
        set((state) => ({
          categories: state.categories.map(c => c.id !== catId ? c : ({ ...c, items: c.items.filter(i => i.id !== itemId) }))
        }) as any);

        if (isOffline() || isTempId(itemId)) {
          // tempId: se o item.add ainda não subiu, basta enfileirar o remove para depois
          await enqueueOp({ type: 'item.remove', payload: { id: itemId, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          await supabase.from('produtos').update({ deleted_at: new Date().toISOString() }).eq('id', itemId).eq('workspace_id', wId);
          await get().initialize();
        } catch {
          await enqueueOp({ type: 'item.remove', payload: { id: itemId, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
        }
      },

      updateItem: async (catId, itemId, updates) => {
        const dbUp: any = {};
        if (updates.name) dbUp.nome = updates.name;
        if (updates.minQuantity !== undefined) dbUp.estoque_minimo = updates.minQuantity;
        if (updates.unit) dbUp.unidade = updates.unit;
        if (updates.supplierIds) dbUp.fornecedor_ids = updates.supplierIds;
        const wId = useAuthStore.getState().workspaceId;

        // Otimista local
        set((state) => ({
          categories: state.categories.map(c => c.id !== catId ? c : ({
            ...c,
            items: c.items.map(i => i.id !== itemId ? i : ({ ...i, ...updates }))
          }))
        }) as any);

        if (isOffline() || isTempId(itemId)) {
          await enqueueOp({ type: 'item.update', payload: { id: itemId, workspace_id: wId, ...dbUp }, workspaceId: wId!, refFields: ['id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          await supabase.from('produtos').update(dbUp).eq('id', itemId).eq('workspace_id', wId);
          await get().initialize();
        } catch {
          await enqueueOp({ type: 'item.update', payload: { id: itemId, workspace_id: wId, ...dbUp }, workspaceId: wId!, refFields: ['id'] });
        }
      },

      updateItemQuantity: async (catId, itemId, newQ, type, movQ, note, orderId) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        const op = getCurrentOperator();

        // If offline, enqueue the movement and update local state immediately
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const { enqueuePendingMovementWithRetry } = await import('./idb-queue');
          const ok = await enqueuePendingMovementWithRetry({ id: generateId(), workspaceId: wId, ownerUserId: useAuthStore.getState().currentUserId, categoryId: catId, itemId, type, movQ, newQ, note, orderId: orderId || null, operatorId: op.id || null, operatorName: op.name || 'Sistema', date: new Date().toISOString() });
          if (!ok) { toast.error('Falha ao enfileirar movimento'); return; }

          // Update local categories to reflect new quantity immediately for UX
          set((state) => {
            const cats = state.categories.map(c => {
              if (c.id !== catId) return c;
              return {
                ...c,
                items: c.items.map(i => i.id === itemId ? { ...i, quantity: newQ, history: [{ id: generateId(), type, quantity: movQ, newTotal: newQ, date: new Date().toISOString(), note: note || '' }, ...(i.history || []) ] } : i)
              };
            });
            return { categories: cats } as any;
          });
          return;
        }

        // Online: perform DB updates
        await supabase.from('produtos').update({ quantidade: newQ }).eq('id', itemId).eq('workspace_id', wId);
        await supabase.from('movimentacoes').insert([{ workspace_id: wId, produto_id: itemId, tipo: type, quantidade: movQ, novo_total: newQ, observacao: note, pedido_id: orderId || null, operador_id: op.id !== 'admin' ? op.id : null, nome_operador: op.name || 'Administrador', data: new Date().toISOString() }]);
        await get().initialize();
      },

      addCategory: async (cat) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        // DEPOIS
const maxPos = get().categories.reduce((m, c) => Math.max(m, c.posicao ?? 0), 0);
await supabase.from('categorias').insert([{ nome: cat.name, workspace_id: wId, posicao: maxPos + 1 }]);
        await get().initialize();
      },

      updateCategory: async (id, name) => {
        const { supabase } = await import('./supabase');
        await supabase.from('categorias').update({ nome: name }).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      removeCategory: async (id) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        const now = new Date().toISOString();
        // Soft delete dos produtos da categoria primeiro
        await supabase
          .from('produtos')
          .update({ deleted_at: now })
          .eq('categoria_id', id)
          .eq('workspace_id', wId)
          .is('deleted_at', null);
        // Soft delete da categoria
        await supabase
          .from('categorias')
          .update({ deleted_at: now })
          .eq('id', id)
          .eq('workspace_id', wId);
        await get().initialize();
      },

      reorderCategories: async (orderedIds) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        // Optimistic local update
        set((state) => {
          const map = new Map(state.categories.map(c => [c.id, c]));
          const next = orderedIds.map(id => map.get(id)).filter(Boolean) as typeof state.categories;
          // Append any that weren't in orderedIds (safety)
          state.categories.forEach(c => { if (!orderedIds.includes(c.id)) next.push(c); });
          return { categories: next } as any;
        });
        // Persist (one update per row — small N)
        await Promise.all(orderedIds.map((id, idx) =>
          supabase.from('categorias').update({ posicao: idx + 1 }).eq('id', id).eq('workspace_id', wId)
        ));
      },

      reorderItems: async (categoryId, orderedIds) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        set((state) => {
          const cats = state.categories.map(c => {
            if (c.id !== categoryId) return c;
            const map = new Map(c.items.map(i => [i.id, i]));
            const next = orderedIds.map(id => map.get(id)).filter(Boolean) as typeof c.items;
            c.items.forEach(i => { if (!orderedIds.includes(i.id)) next.push(i); });
            return { ...c, items: next };
          });
          return { categories: cats } as any;
        });
        await Promise.all(orderedIds.map((id, idx) =>
          supabase.from('produtos').update({ posicao: idx + 1 }).eq('id', id).eq('workspace_id', wId)
        ));
      },

      clearHistory: async () => { /* Bloqueado por auditoria VEXO */ },

      addSupplier: async (s) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        const { error } = await supabase.from('fornecedores').insert([{
          workspace_id: wId,
          nome: s.name,
          contato: s.contact || null,
          telefone: s.phone || null,
          email: s.email || null,
          cnpj: s.cnpj ? s.cnpj : null,
          observacao: s.notes || null,
        }]);
        if (error) throw error;
        await get().initialize();
      },

      updateSupplier: async (id, up) => {
        const { supabase } = await import('./supabase');
        const dbUp: any = {
          nome: up.name,
          contato: up.contact || null,
          telefone: up.phone || null,
          email: up.email || null,
          cnpj: up.cnpj ? up.cnpj : null,
          observacao: up.notes || null,
        };
        const { error } = await supabase.from('fornecedores').update(dbUp).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        if (error) throw error;
        await get().initialize();
      },

      removeSupplier: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('fornecedores').delete().eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      addOrder: async (o) => {
        const wId = useAuthStore.getState().workspaceId;
        const payload: any = {
          workspace_id: wId,
          fornecedor_id: o.supplierId,
          produto_id: o.linkedItemId,
          categoria_id: o.linkedCategoryId,
          unidade: o.unit,
          preco_por_unidade: o.pricePerUnit || 0,
          quantidade_pedida: o.quantityOrdered,
          data_esperada: o.expectedDate,
          status_prazo: o.deadlineStatus,
          status_entrega: o.deliveryStatus,
          observacoes: o.notes,
          descricao: o.productDescription,
        };

        const doOptimisticAdd = (tmpId: string) => {
          const local: Order = {
            id: tmpId,
            supplierId: o.supplierId,
            linkedCategoryId: o.linkedCategoryId,
            linkedItemId: o.linkedItemId,
            unit: o.unit,
            quantityOrdered: Number(o.quantityOrdered) || 0,
            quantityDelivered: 0,
            expectedDate: o.expectedDate,
            deliveryDate: undefined,
            deadlineStatus: o.deadlineStatus,
            deliveryStatus: o.deliveryStatus,
            notes: o.notes,
            stockEntryCreated: false,
            stockEntryQuantity: 0,
            deliveries: [],
            productDescription: o.productDescription || 'Pedido sem descrição',
            orderDate: new Date().toISOString(),
            quantityReturned: 0,
            pricePerUnit: Number(o.pricePerUnit) || 0,
          } as any;
          set((state) => ({ orders: [local, ...state.orders] }) as any);
        };

        if (isOffline()) {
          const tmpId = genTempId('order');
          doOptimisticAdd(tmpId);
          await enqueueOp({ type: 'order.add', payload, workspaceId: wId!, createsTempId: tmpId, refFields: ['fornecedor_id', 'produto_id', 'categoria_id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          const { error } = await supabase.from('pedidos').insert([payload]);
          if (error) throw error;
          await get().initialize();
        } catch {
          const tmpId = genTempId('order');
          doOptimisticAdd(tmpId);
          await enqueueOp({ type: 'order.add', payload, workspaceId: wId!, createsTempId: tmpId, refFields: ['fornecedor_id', 'produto_id', 'categoria_id'] });
          toast.info('Sem conexão — pedido será criado quando voltar online');
        }
      },

       updateOrder: async (id, up) => {
        const dbUp: any = {};
        if (up.expectedDate !== undefined)       dbUp.data_esperada      = up.expectedDate;
        if (up.notes !== undefined)              dbUp.observacoes        = up.notes;
        if (up.productDescription !== undefined) dbUp.descricao          = up.productDescription;
        if (up.pricePerUnit !== undefined)       dbUp.preco_por_unidade  = Number(up.pricePerUnit);
        if (up.quantityOrdered !== undefined)    dbUp.quantidade_pedida  = Number(up.quantityOrdered);
        if (up.unit !== undefined)               dbUp.unidade            = up.unit;
        if (up.linkedCategoryId !== undefined)   dbUp.categoria_id       = up.linkedCategoryId;
        if (up.linkedItemId !== undefined)       dbUp.produto_id         = up.linkedItemId;
        if (up.supplierId !== undefined)         dbUp.fornecedor_id      = up.supplierId;
        const wId = useAuthStore.getState().workspaceId;
        const existingOrder = get().orders.find(o => o.id === id);
        const nextDeadlineStatus = existingOrder
          ? calcDeadlineStatus(up.expectedDate ?? existingOrder.expectedDate, up.deliveryDate ?? existingOrder.deliveryDate)
          : undefined;
        if (nextDeadlineStatus) dbUp.status_prazo = nextDeadlineStatus;

        // Otimista local
        set((state) => ({
          orders: state.orders.map(o => o.id !== id ? o : ({ ...o, ...up, deadlineStatus: nextDeadlineStatus ?? o.deadlineStatus }))
        }) as any);

        if (isOffline() || isTempId(id)) {
          await enqueueOp({ type: 'order.update', payload: { id, workspace_id: wId, ...dbUp }, workspaceId: wId!, refFields: ['id', 'fornecedor_id', 'produto_id', 'categoria_id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          await supabase.from('pedidos').update(dbUp).eq('id', id).eq('workspace_id', wId);
          await get().initialize();
        } catch {
          await enqueueOp({ type: 'order.update', payload: { id, workspace_id: wId, ...dbUp }, workspaceId: wId!, refFields: ['id', 'fornecedor_id', 'produto_id', 'categoria_id'] });
        }
      },

      removeOrder: async (id) => {
        const wId = useAuthStore.getState().workspaceId;
        set((state) => ({ orders: state.orders.filter(o => o.id !== id) }) as any);

        if (isOffline() || isTempId(id)) {
          await enqueueOp({ type: 'order.remove', payload: { id, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          await supabase.from('pedidos').delete().eq('id', id).eq('workspace_id', wId);
          await get().initialize();
        } catch {
          await enqueueOp({ type: 'order.remove', payload: { id, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
        }
      },

      registerDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry }) => {
        const wId = useAuthStore.getState().workspaceId;
        const state = get();
        const order = state.orders.find(o => o.id === orderId);
        if (!order) return;
        const totalDel = order.quantityDelivered + quantityDelivered;
        const newDeadline = calcDeadlineStatus(order.expectedDate, deliveryDate);
        const newDelivery = calcDeliveryStatus(order.quantityOrdered, totalDel);
        const newStockCreatedFlag = createStockEntry || order.stockEntryCreated;

        // Otimista local: aplica em qualquer caso (online/offline)
        const localDeliveryId = genTempId('delivery');
        set((s) => ({
          orders: s.orders.map(o => o.id !== orderId ? o : ({
            ...o,
            quantityDelivered: totalDel,
            deadlineStatus: newDeadline,
            deliveryStatus: newDelivery,
            stockEntryCreated: newStockCreatedFlag,
            stockEntryQuantity: (createStockEntry ? (o.stockEntryQuantity || 0) + stockEntryQuantity : o.stockEntryQuantity),
            deliveryDate,
            deliveries: [{ id: localDeliveryId, date: deliveryDate, quantity: quantityDelivered, stockEntryQuantity, notes, createStockEntry }, ...(o.deliveries || [])]
          }))
        }) as any);

        const entregaPayload: any = { workspace_id: wId, pedido_id: orderId, data: deliveryDate, quantidade: quantityDelivered, quantidade_estoque: stockEntryQuantity, observacoes: notes, gerou_entrada_estoque: createStockEntry };
        const pedidoUpdatePayload: any = { id: orderId, workspace_id: wId, quantidade_entregue: totalDel, status_prazo: newDeadline, status_entrega: newDelivery, entrada_estoque_criada: newStockCreatedFlag };

        const enqueueDeliveryOps = async () => {
          await enqueueOp({ type: 'delivery.register', payload: entregaPayload, workspaceId: wId!, createsTempId: localDeliveryId, refFields: ['pedido_id'] });
          await enqueueOp({ type: 'order.update', payload: pedidoUpdatePayload, workspaceId: wId!, refFields: ['id'] });
        };

        if (isOffline() || isTempId(orderId)) {
          await enqueueDeliveryOps();
          if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity > 0) {
            const item = state.categories.find(c => c.id === order.linkedCategoryId)?.items.find(i => i.id === order.linkedItemId);
            if (item) await get().updateItemQuantity(order.linkedCategoryId, order.linkedItemId, item.quantity + stockEntryQuantity, 'entrada', stockEntryQuantity, `Chegada de Pedido #${String(orderId).slice(-6).toUpperCase()}`, orderId);
          }
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          const { error: e1 } = await supabase.from('entregas_pedido').insert([entregaPayload]);
          if (e1) throw e1;
          const { error: e2 } = await supabase.from('pedidos').update({ quantidade_entregue: totalDel, status_prazo: newDeadline, status_entrega: newDelivery, entrada_estoque_criada: newStockCreatedFlag }).eq('id', orderId);
          if (e2) throw e2;
          if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity > 0) {
            const item = state.categories.find(c => c.id === order.linkedCategoryId)?.items.find(i => i.id === order.linkedItemId);
            if (item) await state.updateItemQuantity(order.linkedCategoryId, order.linkedItemId, item.quantity + stockEntryQuantity, 'entrada', stockEntryQuantity, `Chegada de Pedido #${orderId.slice(-6).toUpperCase()}`, orderId);
          }
          await get().initialize();
        } catch (err) {
          console.warn('[registerDelivery] falha online — enfileirando', err);
          await enqueueDeliveryOps();
          toast.info('Sem conexão — entrega será sincronizada depois');
        }
      },

      updateDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry, linkedCategoryId, linkedItemId }) => {
  const wId = useAuthStore.getState().workspaceId;
  const state = get();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  const totalDel = Number(quantityDelivered);
  const keepFinalizedStatus = order.deliveryStatus !== 'Entrega Incompleta';
  const nextStockEntryQuantity = stockEntryQuantity ?? order.stockEntryQuantity;
  const nextNotes = notes !== undefined ? notes : order.notes;
  const targetDelivery = [...(order.deliveries || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const nextDeadline = calcDeadlineStatus(order.expectedDate, deliveryDate);
  const nextDeliveryStatus = keepFinalizedStatus ? order.deliveryStatus : calcDeliveryStatus(order.quantityOrdered, totalDel);

  // Otimista local
  set((s) => ({
    orders: s.orders.map(o => o.id !== orderId ? o : ({
      ...o,
      quantityDelivered: totalDel,
      deadlineStatus: nextDeadline,
      deliveryStatus: nextDeliveryStatus,
      stockEntryCreated: createStockEntry || o.stockEntryCreated,
      stockEntryQuantity: nextStockEntryQuantity,
      notes: nextNotes,
      deliveryDate,
      deliveries: (o.deliveries || []).map(d => d.id === targetDelivery?.id ? ({ ...d, date: deliveryDate, quantity: (o.deliveries || []).length <= 1 ? totalDel : d.quantity, stockEntryQuantity: (o.deliveries || []).length <= 1 ? nextStockEntryQuantity : d.stockEntryQuantity, notes: nextNotes ?? d.notes }) : d)
    }))
  }) as any);

  const pedidoUpd: any = { id: orderId, workspace_id: wId, quantidade_entregue: totalDel, status_prazo: nextDeadline, status_entrega: nextDeliveryStatus, entrada_estoque_criada: createStockEntry || order.stockEntryCreated, quantidade_estoque_gerada: nextStockEntryQuantity, observacoes: nextNotes || null };

  if (isOffline() || isTempId(orderId) || (targetDelivery?.id && isTempId(targetDelivery.id))) {
    await enqueueOp({ type: 'order.update', payload: pedidoUpd, workspaceId: wId!, refFields: ['id'] });
    if (targetDelivery?.id) {
      const deliveryUpdate: any = { id: targetDelivery.id, workspace_id: wId, data: deliveryDate, observacoes: nextNotes || null };
      if ((order.deliveries || []).length <= 1) {
        deliveryUpdate.quantidade = totalDel;
        deliveryUpdate.quantidade_estoque = nextStockEntryQuantity;
        deliveryUpdate.gerou_entrada_estoque = createStockEntry || order.stockEntryCreated;
      }
      await enqueueOp({ type: 'delivery.update', payload: deliveryUpdate, workspaceId: wId!, refFields: ['id'] });
    }
    return;
  }
  
  const { supabase } = await import('./supabase');
  try {
  const { error: pedidoError } = await supabase.from('pedidos').update({
    quantidade_entregue: totalDel,
    status_prazo: nextDeadline,
    status_entrega: nextDeliveryStatus,
    entrada_estoque_criada: createStockEntry || order.stockEntryCreated,
    quantidade_estoque_gerada: nextStockEntryQuantity,
    observacoes: nextNotes || null
  }).eq('id', orderId).eq('workspace_id', wId);
  if (pedidoError) throw pedidoError;

  if (targetDelivery?.id) {
    const deliveryUpdate: any = { data: deliveryDate, observacoes: nextNotes || null };
    if ((order.deliveries || []).length <= 1) {
      deliveryUpdate.quantidade = totalDel;
      deliveryUpdate.quantidade_estoque = nextStockEntryQuantity;
      deliveryUpdate.gerou_entrada_estoque = createStockEntry || order.stockEntryCreated;
    }
    const { error: entregaError } = await supabase.from('entregas_pedido').update(deliveryUpdate).eq('id', targetDelivery.id).eq('workspace_id', wId);
    if (entregaError) throw entregaError;
  }

    await get().initialize();
  } catch (err) {
    console.warn('[updateDelivery] falha online — enfileirando', err);
    await enqueueOp({ type: 'order.update', payload: pedidoUpd, workspaceId: wId!, refFields: ['id'] });
    if (targetDelivery?.id && !isTempId(targetDelivery.id)) {
      const deliveryUpdate: any = { id: targetDelivery.id, workspace_id: wId, data: deliveryDate, observacoes: nextNotes || null };
      if ((order.deliveries || []).length <= 1) {
        deliveryUpdate.quantidade = totalDel;
        deliveryUpdate.quantidade_estoque = nextStockEntryQuantity;
        deliveryUpdate.gerou_entrada_estoque = createStockEntry || order.stockEntryCreated;
      }
      await enqueueOp({ type: 'delivery.update', payload: deliveryUpdate, workspaceId: wId!, refFields: ['id'] });
    }
    toast.info('Sem conexão — alteração será sincronizada depois');
  }
},

      finalizeOrder: async (id) => {
        const wId = useAuthStore.getState().workspaceId;
        set((s) => ({
          orders: s.orders.map(o => o.id !== id ? o : ({ ...o, deliveryStatus: 'Entrega Completa' as any }))
        }) as any);

        if (isOffline() || isTempId(id)) {
          await enqueueOp({ type: 'order.finalize', payload: { id, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
          return;
        }

        const { supabase } = await import('./supabase');
        try {
          await supabase.from('pedidos').update({ status_entrega: 'Entrega Completa' }).eq('id', id).eq('workspace_id', wId);
          await get().initialize();
        } catch {
          await enqueueOp({ type: 'order.finalize', payload: { id, workspace_id: wId }, workspaceId: wId!, refFields: ['id'] });
        }
      },

      addLocation: async (l) => {
        const { supabase } = await import('./supabase');
        const { data } = await supabase.from('locais_estoque').insert([{ workspace_id: useAuthStore.getState().workspaceId, nome: l.name, descricao: l.description, item_refs: JSON.stringify(l.itemRefs || []) }]).select();
        await get().initialize();
        return data ? data[0].id : "";
      },

      updateLocation: async (id, up) => {
        const { supabase } = await import('./supabase');
        await supabase.from('locais_estoque').update({ nome: up.name, descricao: up.description, item_refs: JSON.stringify(up.itemRefs) }).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      removeLocation: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('locais_estoque').delete().eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      toggleLocationItem: async (id, ref) => {
        const { supabase } = await import('./supabase');
        const loc = get().locations.find(l => l.id === id);
        if (!loc) return;
        const newRefs = loc.itemRefs.includes(ref) ? loc.itemRefs.filter(r => r !== ref) : [...loc.itemRefs, ref];
        await supabase.from('locais_estoque').update({ item_refs: JSON.stringify(newRefs) }).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      setQrAlias: async (key, alias) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        await supabase.from('aliases_qr').insert([{ workspace_id: wId, chave: key, tipo: alias.kind, categoria_id: alias.kind === 'item' ? alias.categoryId : null, item_id: alias.kind === 'item' ? alias.itemId : null, location_id: alias.kind === 'location' ? alias.locationId : null }]);
        await get().initialize();
      },

      removeQrAlias: async (key) => {
        const { supabase } = await import('./supabase');
        await supabase.from('aliases_qr').delete().eq('chave', key).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      syncPendingMovements: async () => {
        const { getPendingMovements, clearPendingMovementsFor } = await import('./idb-queue');
        const scope = currentQueueScope();
        const list = await getPendingMovements(scope);
        if (!list || list.length === 0) return;
        const { supabase } = await import('./supabase');
        try {
          console.log(`[syncPendingMovements] Sincronizando ${list.length} movimentações...`);
          const inserts = list.map(l => {
            const productId = isTempId(l.itemId) ? resolveTempId(l.itemId) : l.itemId;
            const orderId = l.orderId ? (isTempId(l.orderId) ? resolveTempId(l.orderId) : l.orderId) : null;
            if (!productId) throw new Error('Movimentação aguardando item offline sincronizar primeiro');
            if (l.orderId && !orderId) throw new Error('Movimentação aguardando pedido offline sincronizar primeiro');
            return { workspace_id: l.workspaceId, produto_id: productId, tipo: l.type, quantidade: l.movQ, novo_total: l.newQ, observacao: l.note || '', pedido_id: orderId, operador_id: l.operatorId || null, nome_operador: l.operatorName || 'Sistema', data: l.date };
          });
          const { error: insErr } = await supabase.from('movimentacoes').insert(inserts);
          if (insErr) throw new Error(`Falha ao inserir movimentações: ${insErr.message}`);
          
          // Update product quantities in parallel
          const updateErrors: any[] = [];
          await Promise.all(list.map(async (l) => {
            const productId = isTempId(l.itemId) ? resolveTempId(l.itemId) : l.itemId;
            const { error: upErr } = await supabase.from('produtos').update({ quantidade: l.newQ }).eq('id', productId).eq('workspace_id', l.workspaceId);
            if (upErr) updateErrors.push({ item: l.itemId, error: upErr.message });
          }));
          
          if (updateErrors.length > 0) {
            console.warn('[syncPendingMovements] Alguns updates falharam:', updateErrors);
          }
          
          await clearPendingMovementsFor(scope);
          await get().initialize();
          console.log(`[syncPendingMovements] ✓ ${list.length} movimentação(ões) sincronizada(s) com sucesso`);
          toast.success(`${list.length} movimentação(ões) sincronizada(s)`);
        } catch (err) {
          console.error('[syncPendingMovements] Erro:', err);
          throw err;
        }
      },

      pendingMovementsCount: async () => {
        try { const { countPendingMovementsFor } = await import('./idb-queue'); return await countPendingMovementsFor(currentQueueScope()); } catch { return 0; }
      },

      pendingOpsCount: async () => {
        try { return await countOps(currentQueueScope()); } catch { return 0; }
      },

      syncPendingOps: async (manual = false) => {
        const scope = currentQueueScope();
        const total = await countOps(scope);
        if (total === 0) return;
        const { supabase } = await import('./supabase');

        const exec: Record<OpType, (p: any) => Promise<{ realId?: string } | void>> = {
          'item.add': async (p) => {
            const { data, error } = await supabase.from('produtos').insert([p]).select('id').single();
            if (error) throw error;
            return { realId: data?.id };
          },
          'item.update': async (p) => {
            const { id, workspace_id, ...rest } = p;
            const { error } = await supabase.from('produtos').update(rest).eq('id', id).eq('workspace_id', workspace_id);
            if (error) throw error;
          },
          'item.remove': async (p) => {
            const { error } = await supabase.from('produtos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id).eq('workspace_id', p.workspace_id);
            if (error) throw error;
          },
          'order.add': async (p) => {
            const { data, error } = await supabase.from('pedidos').insert([p]).select('id').single();
            if (error) throw error;
            return { realId: data?.id };
          },
          'order.update': async (p) => {
            const { id, workspace_id, ...rest } = p;
            const { error } = await supabase.from('pedidos').update(rest).eq('id', id).eq('workspace_id', workspace_id);
            if (error) throw error;
          },
          'order.remove': async (p) => {
            const { error } = await supabase.from('pedidos').delete().eq('id', p.id).eq('workspace_id', p.workspace_id);
            if (error) throw error;
          },
          'order.finalize': async (p) => {
            const { error } = await supabase.from('pedidos').update({ status_entrega: 'Entrega Completa' }).eq('id', p.id).eq('workspace_id', p.workspace_id);
            if (error) throw error;
          },
          'delivery.register': async (p) => {
            const { data, error } = await supabase.from('entregas_pedido').insert([p]).select('id').single();
            if (error) throw error;
            return { realId: data?.id };
          },
          'delivery.update': async (p) => {
            const { id, workspace_id, ...rest } = p;
            const { error } = await supabase.from('entregas_pedido').update(rest).eq('id', id).eq('workspace_id', workspace_id);
            if (error) throw error;
          },
        };

        try {
          const result = await flushOps(exec, scope);
          pruneTmpMap();
          if (result.ok > 0) {
            if (manual) toast.success(`${result.ok} operação(ões) sincronizada(s)`);
            await get().initialize();
          }
          if (result.failed > 0 && manual) {
            toast.error(`Falha ao sincronizar — tentaremos novamente`);
          }
        } catch (err) {
          console.error('[syncPendingOps]', err);
        }
      },

      applyBatchMovements: async (moves) => {
        if (!moves || moves.length === 0) return;
        const { supabase } = await import('./supabase');
        const inserts = moves.map(m => ({ workspace_id: useAuthStore.getState().workspaceId, produto_id: m.itemId, tipo: m.type, quantidade: m.movQ, novo_total: m.newQ, observacao: m.note || '', pedido_id: m.orderId || null, operador_id: getCurrentOperator().id || null, nome_operador: getCurrentOperator().name || 'Sistema', data: new Date().toISOString() }));
        try {
          const { error: insErr } = await supabase.from('movimentacoes').insert(inserts);
          if (insErr) throw new Error(`Falha ao aplicar lote: ${insErr.message}`);
          // Update products quantities in parallel
          const updateErrors: any[] = [];
          await Promise.all(moves.map(async (m) => {
            const { error: upErr } = await supabase.from('produtos').update({ quantidade: m.newQ }).eq('id', m.itemId).eq('workspace_id', useAuthStore.getState().workspaceId);
            if (upErr) updateErrors.push({ item: m.itemId, error: upErr.message });
          }));
          if (updateErrors.length > 0) console.warn('[applyBatchMovements] Update errors:', updateErrors);
          await get().initialize();
        } catch (err) {
          console.error('[applyBatchMovements] erro', err);
          // On failure, enqueue to pending list so it will be retried
          const { enqueuePendingMovementWithRetry } = await import('./idb-queue');
          const failedEnqueues: string[] = [];
          await Promise.all(moves.map(async (m) => {
            const ok = await enqueuePendingMovementWithRetry({ id: generateId(), workspaceId: useAuthStore.getState().workspaceId, ownerUserId: useAuthStore.getState().currentUserId, categoryId: m.categoryId, itemId: m.itemId, type: m.type, movQ: m.movQ, newQ: m.newQ, note: m.note || '', orderId: m.orderId || null, operadorId: getCurrentOperator().id || null, operatorName: getCurrentOperator().name || 'Sistema', date: new Date().toISOString() });
            if (!ok) failedEnqueues.push(m.itemId);
          }));
          if (failedEnqueues.length > 0) console.error('[applyBatchMovements] Falha ao enfileirar alguns itens:', failedEnqueues);
        }
      },

      fetchMoreSuppliers: async (limit = 30, append = false) => {
        const { supabase } = await import('./supabase');
        const workspaceId = useAuthStore.getState().workspaceId;
        if (!workspaceId) return;

        let query = supabase
          .from('fornecedores')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('criado_em', { ascending: false })
          .limit(limit);

        const cursor = get().suppliersCursor;
        if (cursor && append) {
          query = query.lt('criado_em', cursor); // cursor-based pagination
        }

        const { data, error } = await query;
        if (error) {
          console.error('[fetchMoreSuppliers] error:', error);
          return;
        }

        const newSuppliers = (data || []).map(f => ({ 
          id: f.id, 
          name: f.nome, 
          contact: f.contato || '', 
          phone: f.telefone || '', 
          email: f.email || '', 
          notes: f.observacao || '', 
          cnpj: f.cnpj || '' 
        }));

        const suppliers = append ? [...get().suppliers, ...newSuppliers] : newSuppliers;
        const nextCursor = (data || []).length > 0 ? data[data.length - 1]?.criado_em || null : null;

        set({ 
          suppliers, 
          suppliersCursor: nextCursor, 
          suppliersHasMore: (data || []).length === limit 
        });
      },

      fetchMoreOrders: async (limit = 50, append = false) => {
        const { supabase } = await import('./supabase');
        const workspaceId = useAuthStore.getState().workspaceId;
        if (!workspaceId) return;

        let query = supabase
          .from('pedidos')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('criado_em', { ascending: false })
          .limit(limit);

        const cursor = get().ordersCursor;
        if (cursor && append) {
          query = query.lt('criado_em', cursor); // cursor-based pagination
        }

        const { data, error } = await query;
        if (error) {
          console.error('[fetchMoreOrders] error:', error);
          return;
        }

        const { data: entRes } = await supabase.from('entregas_pedido').select('*').eq('workspace_id', workspaceId);
        const newOrders = (data || []).map(p => {
          const ents = (entRes || []).filter(e => e.pedido_id === p.id).map(e => ({ 
            id: e.id, 
            date: e.data, 
            quantity: Number(e.quantidade), 
            stockEntryQuantity: Number(e.quantidade_estoque), 
            notes: e.observacoes, 
            createStockEntry: e.gerou_entrada_estoque 
          })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const latestDeliveryDate = ents.length > 0 ? ents[0].date : undefined;
          const deadlineStatus = calcDeadlineStatus(p.data_esperada, latestDeliveryDate);
          return { 
            id: p.id, 
            supplierId: p.fornecedor_id, 
            linkedCategoryId: p.categoria_id, 
            linkedItemId: p.produto_id, 
            unit: p.unidade, 
            quantityOrdered: Number(p.quantidade_pedida), 
            quantityDelivered: Number(p.quantidade_entregue), 
            expectedDate: p.data_esperada, 
            deliveryDate: latestDeliveryDate, 
            deadlineStatus, 
            deliveryStatus: p.status_entrega as any, 
            notes: p.observacoes, 
            stockEntryCreated: p.entrada_estoque_criada, 
            stockEntryQuantity: Number(p.quantidade_estoque_gerada), 
            deliveries: ents,
            productDescription: p.descricao || p.produto_id || 'Pedido sem descrição',
            orderDate: p.criado_em || new Date().toISOString(), 
            quantityReturned: 0, 
            pricePerUnit: Number(p.preco_por_unidade) || 0,
          };
        });

        const orders = append ? [...get().orders, ...newOrders] : newOrders;
        const nextCursor = (data || []).length > 0 ? data[data.length - 1]?.criado_em || null : null;

        set({ 
          orders, 
          ordersCursor: nextCursor, 
          ordersHasMore: (data || []).length === limit 
        });
      },

fetchMoreHistory: async (itemId?: string) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        if (!wId) return;

        const BATCH = 100;
        let cursor: string | null = null;

        if (itemId) {
          // Cursor por item: data da movimentação mais antiga já carregada para este item
          const item = get().categories.flatMap(c => c.items).find(i => i.id === itemId);
          if (!item || item.history.length === 0) return;
          cursor = [...item.history].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          )[0].date;
        } else {
          // Cursor global
          cursor = get().movimentacoesCursor;
          if (!cursor) return;
        }

        let query = supabase
          .from('movimentacoes')
          .select('*')
          .eq('workspace_id', wId)
          .lt('data', cursor)
          .order('data', { ascending: false })
          .limit(BATCH);

        if (itemId) query = query.eq('produto_id', itemId);

        const { data, error } = await query;
        if (error || !data || data.length === 0) {
          if (!itemId) set({ movimentacoesHasMore: false });
          return;
        }

        // Anexar ao history de cada item afetado no estado
        set((state) => {
          const cats = state.categories.map(cat => ({
            ...cat,
            items: cat.items.map(it => {
              const newEntries = data
                .filter(m => m.produto_id === it.id)
                .map(m => ({
                  id: m.id,
                  type: m.tipo as any,
                  quantity: Number(m.quantidade),
                  newTotal: Number(m.novo_total),
                  date: m.data,
                  note: m.observacao || '',
                  orderId: m.pedido_id,
                  operatorId: m.operador_id,
                  operatorName: m.nome_operador || 'Sistema',
                }));
              if (newEntries.length === 0) return it;
              return { ...it, history: [...it.history, ...newEntries] };
            }),
          }));
          return {
            categories: cats,
            movimentacoesCursor: !itemId && data.length > 0
              ? data[data.length - 1].data
              : state.movimentacoesCursor,
            movimentacoesHasMore: !itemId
              ? data.length === BATCH
              : state.movimentacoesHasMore,
          } as any;
        });
      },

  }),
    { 
      name: 'estoque-local-v3',
      // MODO OFFLINE ATIVADO: Para o scanner funcionar sem internet no galpão,
      // nós mantemos uma cópia (cache) dos catálogos na memória do dispositivo.
      partialize: (state) => ({ 
        selectedCategoryId: state.selectedCategoryId,
        categories: state.categories, // Catálogo + histórico (offline)
        locations: state.locations,   // Locais (Scanner de Prateleiras)
        qrAliases: state.qrAliases,   // Links dos QR Codes
        suppliers: state.suppliers,   // Fornecedores (offline)
        orders: state.orders          // Pedidos (offline)
      })
    }
  )
)