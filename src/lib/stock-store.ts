import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, StockItem, HistoryEntry, Supplier, Order, OrderDeliveryEntry, StockLocation } from './types'
import { useAuthStore } from './auth-store'

export type QrAlias = { kind: 'item'; categoryId: string; itemId: string } | { kind: 'location'; locationId: string }

// --- FUNÇÕES AUXILIARES ---
function getCurrentOperator(): { id?: string; name?: string } {
  try {
    const u = useAuthStore.getState().getCurrentUser()
    return u ? { id: u.id, name: u.name } : {}
  } catch { return {} }
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36)

function calcDeadlineStatus(exp: string | undefined, del: string | undefined): import('./types').OrderDeadlineStatus {
  const now = new Date()
  if (del && exp) return new Date(del) <= new Date(exp) ? 'Entregue no Prazo' : 'Entregue no Prazo'
  if (!exp) return 'Dentro do Prazo'
  return now > new Date(exp) ? 'Pedido Atrasado' : 'Dentro do Prazo'
}

function calcDeliveryStatus(ord: number, del: number): import('./types').OrderDeliveryStatus {
  if (del <= 0) return 'Entrega Incompleta'
  if (del < ord) return 'Entrega Incompleta'
  return del > ord ? 'Entrega Excedente' : 'Entrega Completa'
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
  initialize: () => Promise<void>;
  setSelectedCategory: (id: string) => void;
  addItem: (catId: string, item: Omit<StockItem, 'history'>) => Promise<void>;
  removeItem: (catId: string, itemId: string) => Promise<void>;
  updateItem: (catId: string, itemId: string, updates: Partial<StockItem>) => Promise<void>;
  updateItemQuantity: (catId: string, itemId: string, newQ: number, type: 'entrada' | 'saida', movQ: number, note?: string, orderId?: string) => Promise<void>;
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
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

      initialize: async () => {
        set({ loading: true });
        try {
          const { supabase } = await import('./supabase');
          const workspaceId = useAuthStore.getState().workspaceId;
          if (!workspaceId) { set({ loading: false }); return; }

          const [catRes, prodRes, movRes, supRes, locRes, pedRes, entRes, qrRes] = await Promise.all([
            supabase.from('categorias').select('*').eq('workspace_id', workspaceId),
            supabase.from('produtos').select('*').eq('workspace_id', workspaceId),
            supabase.from('movimentacoes').select('*').eq('workspace_id', workspaceId).order('data', { ascending: false }),
            supabase.from('fornecedores').select('*').eq('workspace_id', workspaceId),
            supabase.from('locais_estoque').select('*').eq('workspace_id', workspaceId),
            supabase.from('pedidos').select('*').eq('workspace_id', workspaceId).order('criado_em', { ascending: false }),
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
             const ents = (entRes.data ||[]).filter(e => e.pedido_id === p.id).map(e => ({ id: e.id, date: e.data, quantity: Number(e.quantidade), stockEntryQuantity: Number(e.quantidade_estoque), notes: e.observacoes, createStockEntry: e.gerou_entrada_estoque }));
             return { 
               id: p.id, 
               supplierId: p.fornecedor_id, 
               linkedCategoryId: p.categoria_id, 
               linkedItemId: p.produto_id, 
               unit: p.unidade, 
               quantityOrdered: Number(p.quantidade_pedida), 
               quantityDelivered: Number(p.quantidade_entregue), 
               expectedDate: p.data_esperada, 
               deliveryDate: ents.length > 0 ? ents[0].date : undefined, 
               deadlineStatus: p.status_prazo as any, 
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
             categories = catRes.data.map(cat => ({
                id: cat.id, name: cat.nome,
                items: (prodRes.data || []).filter(pr => pr.categoria_id === cat.id).map(pr => ({
                  id: pr.id, name: pr.nome, quantity: Number(pr.quantidade), minQuantity: Number(pr.estoque_minimo), unit: pr.unidade, categoryId: pr.categoria_id, supplierIds: pr.fornecedor_ids || [],
                  history: (movRes.data || []).filter(m => m.produto_id === pr.id).map(m => ({ id: m.id, type: m.tipo as any, quantity: Number(m.quantidade), newTotal: Number(m.novo_total), date: m.data, note: m.observacao || '', orderId: m.pedido_id, operatorId: m.operador_id, operatorName: m.nome_operador || 'Sistema' }))
                }))
             }));
          }
          set({ categories, suppliers, locations, orders, qrAliases, selectedCategoryId: categories.length > 0 ? categories[0].id : null, loading: false });
        } catch { set({ loading: false }); }
      },

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      addItem: async (catId, item) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        await supabase.from('produtos').insert([{ nome: item.name, quantidade: item.quantity, estoque_minimo: item.minQuantity || 0, unidade: item.unit || 'un', categoria_id: catId, workspace_id: wId }]);
        await get().initialize();
      },

      removeItem: async (catId, itemId) => {
        const { supabase } = await import('./supabase');
        await supabase.from('produtos').delete().eq('id', itemId).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      updateItem: async (catId, itemId, updates) => {
        const { supabase } = await import('./supabase');
        const dbUp: any = {};
        if (updates.name) dbUp.nome = updates.name;
        if (updates.minQuantity !== undefined) dbUp.estoque_minimo = updates.minQuantity;
        if (updates.unit) dbUp.unidade = updates.unit;
        if (updates.supplierIds) dbUp.fornecedor_ids = updates.supplierIds;
        await supabase.from('produtos').update(dbUp).eq('id', itemId).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      updateItemQuantity: async (catId, itemId, newQ, type, movQ, note, orderId) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        const op = getCurrentOperator();
        await supabase.from('produtos').update({ quantidade: newQ }).eq('id', itemId).eq('workspace_id', wId);
        await supabase.from('movimentacoes').insert([{ workspace_id: wId, produto_id: itemId, tipo: type, quantidade: movQ, novo_total: newQ, observacao: note, pedido_id: orderId || null, operador_id: op.id !== 'admin' ? op.id : null, nome_operador: op.name || 'Administrador', data: new Date().toISOString() }]);
        await get().initialize();
      },

      addCategory: async (cat) => {
        const { supabase } = await import('./supabase');
        await supabase.from('categorias').insert([{ nome: cat.name, workspace_id: useAuthStore.getState().workspaceId }]);
        await get().initialize();
      },

      updateCategory: async (id, name) => {
        const { supabase } = await import('./supabase');
        await supabase.from('categorias').update({ nome: name }).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      removeCategory: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('categorias').delete().eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      clearHistory: async () => { /* Bloqueado por auditoria VEXO */ },

      addSupplier: async (s) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        await supabase.from('fornecedores').insert([{ workspace_id: wId, nome: s.name, contato: s.contact, telefone: s.phone, email: s.email, cnpj: s.cnpj || '', observacao: s.notes || '' }]);
        await get().initialize();
      },

      updateSupplier: async (id, up) => {
        const { supabase } = await import('./supabase');
        const dbUp: any = { nome: up.name, contato: up.contact, telefone: up.phone, email: up.email, cnpj: up.cnpj, observacao: up.notes };
        await supabase.from('fornecedores').update(dbUp).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      removeSupplier: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('fornecedores').delete().eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      addOrder: async (o) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        await supabase.from('pedidos').insert([{ 
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
  descricao: o.productDescription
}]);
        await get().initialize();
      },

      updateOrder: async (id, up) => {
        const { supabase } = await import('./supabase');
       const dbUp: any = {};
if (up.expectedDate) dbUp.data_esperada = up.expectedDate;
if (up.notes) dbUp.observacoes = up.notes;
if (up.productDescription) dbUp.descricao = up.productDescription;
        await supabase.from('pedidos').update(dbUp).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      removeOrder: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('pedidos').delete().eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
      },

      registerDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry }) => {
        const { supabase } = await import('./supabase');
        const wId = useAuthStore.getState().workspaceId;
        const state = get();
        const order = state.orders.find(o => o.id === orderId);
        if (!order) return;
        const totalDel = order.quantityDelivered + quantityDelivered;
        await supabase.from('entregas_pedido').insert([{ workspace_id: wId, pedido_id: orderId, data: deliveryDate, quantidade: quantityDelivered, quantidade_estoque: stockEntryQuantity, observacoes: notes, gerou_entrada_estoque: createStockEntry }]);
        await supabase.from('pedidos').update({ quantidade_entregue: totalDel, status_prazo: calcDeadlineStatus(order.expectedDate, deliveryDate), status_entrega: calcDeliveryStatus(order.quantityOrdered, totalDel), entrada_estoque_criada: createStockEntry || order.stockEntryCreated }).eq('id', orderId);
        if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity > 0) {
          const item = state.categories.find(c => c.id === order.linkedCategoryId)?.items.find(i => i.id === order.linkedItemId);
          if (item) await state.updateItemQuantity(order.linkedCategoryId, order.linkedItemId, item.quantity + stockEntryQuantity, 'entrada', stockEntryQuantity, `Chegada de Pedido #${orderId.slice(-6).toUpperCase()}`, orderId);
        }
        await get().initialize();
      },

      updateDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry, linkedCategoryId, linkedItemId }) => {
  const { supabase } = await import('./supabase');
  const wId = useAuthStore.getState().workspaceId;
  const state = get();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  const totalDel = quantityDelivered;
  
  await supabase.from('pedidos').update({
    quantidade_entregue: totalDel,
    status_prazo: calcDeadlineStatus(order.expectedDate, deliveryDate),
    status_entrega: calcDeliveryStatus(order.quantityOrdered, totalDel),
    entrada_estoque_criada: createStockEntry || order.stockEntryCreated,
    quantidade_estoque_gerada: stockEntryQuantity || order.stockEntryQuantity,
    observacoes: notes || order.notes
  }).eq('id', orderId).eq('workspace_id', wId);

  await get().initialize();
},

      finalizeOrder: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('pedidos').update({ status_entrega: 'Entrega Completa' }).eq('id', id).eq('workspace_id', useAuthStore.getState().workspaceId);
        await get().initialize();
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
  }),
    { 
      name: 'estoque-local-v3',
      // COFRE B2B: Não deixamos o navegador salvar a lista de produtos na máquina.
      // Salvamos APENAS qual foi a última categoria que o usuário clicou na tela.
      partialize: (state) => ({ 
        selectedCategoryId: state.selectedCategoryId 
      })
    }
  )
)