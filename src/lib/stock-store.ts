import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, StockItem, HistoryEntry, Supplier, Order, OrderDeliveryEntry, StockLocation } from './types'

export type QrAlias =
  | { kind: 'item'; categoryId: string; itemId: string }
  | { kind: 'location'; locationId: string }

import { useAuthStore } from './auth-store'

function getCurrentOperator(): { id?: string; name?: string } {
  try {
    const u = useAuthStore.getState().getCurrentUser()
    if (!u) return {}
    return { id: u.id, name: u.name }
  } catch {
    return {}
  }
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36)

function calcDeadlineStatus(
  expectedDate: string | undefined,
  deliveryDate: string | undefined,
): import('./types').OrderDeadlineStatus {
  const now = new Date()
  if (deliveryDate && expectedDate) {
    return new Date(deliveryDate) <= new Date(expectedDate) ? 'Entregue no Prazo' : 'Entregue no Prazo'
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

export interface StockState {
  categories: Category[]
  selectedCategoryId: string | null
  suppliers: Supplier[]
  orders: Order[]
  locations: StockLocation[]
  loading: boolean
  clientId: string | null
  qrAliases: Record<string, QrAlias>

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

  setQrAlias: (key: string, alias: QrAlias) => void
  removeQrAlias: (key: string) => void
}

export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      categories: [],
      selectedCategoryId: null,
      suppliers:[],
      orders: [],
      locations:[],
      loading: false,
      clientId: 'local-user',
      qrAliases: {},

      // -- FETCH SUPREMO BLINDADO (PUXA AS 8 TABELAS DO BANCO AO ENTRAR) --
      initialize: async () => {
        set({ loading: true });
        try {
          const { supabase } = await import('./supabase');
          const { useAuthStore } = await import('./auth-store');
          
          const user = useAuthStore.getState().getCurrentUser();
          if (!user) { set({ loading: false }); return; }

          const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";

          // Puxando TODAS as tabelas
          const[catRes, prodRes, movRes, supRes, locRes, pedRes, entRes, qrRes] = await Promise.all([
            supabase.from('categorias').select('*').eq('workspace_id', workspaceId),
            supabase.from('produtos').select('*').eq('workspace_id', workspaceId),
            supabase.from('movimentacoes').select('*').eq('workspace_id', workspaceId),
            supabase.from('fornecedores').select('*').eq('workspace_id', workspaceId),
            supabase.from('locais_estoque').select('*').eq('workspace_id', workspaceId),
            supabase.from('pedidos').select('*').eq('workspace_id', workspaceId),
            supabase.from('entregas_pedido').select('*').eq('workspace_id', workspaceId),
            supabase.from('aliases_qr').select('*').eq('workspace_id', workspaceId)
          ]);

          // Montando Fornecedores e Locais
          const fornecedores = (supRes.data ||[]).map(f => ({ id: f.id, name: f.nome, contact: f.contato || '', phone: f.telefone || '', email: f.email || '', address: f.endereco || '' }));
          const locais = (locRes.data ||[]).map(l => ({ id: l.id, name: l.nome, description: l.descricao || '', itemRefs: l.item_refs ? JSON.parse(l.item_refs) :[] }));

          // Montando QR Codes
          const qrAliases: Record<string, QrAlias> = {};
          (qrRes.data || []).forEach(qr => {
            if (qr.tipo === 'item') qrAliases[qr.chave] = { kind: 'item', categoryId: qr.categoria_id, itemId: qr.item_id };
            else if (qr.tipo === 'location') qrAliases[qr.chave] = { kind: 'location', locationId: qr.location_id };
          });

          // Montando Pedidos e Entregas
          const pedidosFront: Order[] = (pedRes.data ||[]).map(p => {
             const entregas = (entRes.data ||[])
               .filter(e => e.pedido_id === p.id)
               .map(e => ({ id: e.id, date: e.data, quantity: Number(e.quantidade), stockEntryQuantity: Number(e.quantidade_estoque), notes: e.observacoes, createStockEntry: e.gerou_entrada_estoque }));
             
             return {
               id: p.id, supplierId: p.fornecedor_id, linkedCategoryId: p.categoria_id, linkedItemId: p.produto_id,
               unit: p.unidade, quantityOrdered: Number(p.quantidade_pedida), quantityDelivered: Number(p.quantidade_entregue),
               expectedDate: p.data_esperada, deliveryDate: entregas.length > 0 ? entregas[entregas.length - 1].date : undefined,
               deadlineStatus: p.status_prazo as any, deliveryStatus: p.status_entrega as any, notes: p.observacoes,
               stockEntryCreated: p.entrada_estoque_criada, stockEntryQuantity: Number(p.quantidade_estoque_gerada), deliveries: entregas
             };
          });

          // Montando Categorias + Produtos + Histórico
          let categorias: Category[] =[];
          if (catRes.data) {
             categorias = catRes.data.map((cat) => {
                const itens = (prodRes.data ||[])
                  .filter(prod => prod.categoria_id === cat.id)
                  .map(prod => {
                    const historicoItem = (movRes.data ||[])
                      .filter(m => m.produto_id === prod.id)
                      .map(m => ({ id: m.id, type: m.tipo as 'entrada'|'saida', quantity: Number(m.quantidade), newTotal: Number(m.novo_total), date: m.data, note: m.observacao || '', orderId: m.pedido_id, operatorId: m.operador_id, operatorName: m.nome_operador || '' }));
                    return { id: prod.id, name: prod.nome, quantity: Number(prod.quantidade), minQuantity: Number(prod.estoque_minimo), unit: prod.unidade, categoryId: prod.categoria_id, supplierIds: prod.fornecedor_ids ||[], history: historicoItem };
                  });
                return { id: cat.id, name: cat.nome, items: itens };
             });
          }

          // Injetando TUDO no Estado Front-end
          set({ 
            categories: categorias, suppliers: fornecedores, locations: locais, orders: pedidosFront, qrAliases, 
            selectedCategoryId: categorias.length > 0 ? categorias[0].id : null, loading: false 
          });

        } catch (error) {
          console.error("Erro fatal ao inicializar o banco:", error);
          set({ loading: false });
        }
      },

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      // -- PRODUTOS --
      addItem: async (categoryId, item) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { data, error } = await supabase.from('produtos').insert([{ 
              nome: item.name, quantidade: item.quantity, estoque_minimo: item.minQuantity || 0,
              unidade: item.unit || 'un', categoria_id: categoryId, workspace_id: workspaceId 
        }]).select();

        if (!error && data && data[0]) {
          const newItem: StockItem = { ...item, id: data[0].id, history:[], supplierIds: item.supplierIds ||[] };
          set((state) => ({ categories: state.categories.map((cat) => cat.id === categoryId ? { ...cat, items:[...cat.items, newItem] } : cat) }));
        }
      },
      removeItem: async (categoryId, itemId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('produtos').delete().eq('id', itemId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ categories: state.categories.map((cat) => cat.id === categoryId ? { ...cat, items: cat.items.filter((i) => i.id !== itemId) } : cat) }));
      },
      updateItem: async (categoryId, itemId, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.nome = updates.name;
        if (updates.minQuantity !== undefined) dbUpdates.estoque_minimo = updates.minQuantity;
        if (updates.unit !== undefined) dbUpdates.unidade = updates.unit;
        if (updates.supplierIds !== undefined) dbUpdates.fornecedor_ids = updates.supplierIds;

        const { error } = await supabase.from('produtos').update(dbUpdates).eq('id', itemId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ categories: state.categories.map((cat) => cat.id === categoryId ? { ...cat, items: cat.items.map((item) => item.id === itemId ? { ...item, ...updates } : item) } : cat) }));
      },
      updateItemQuantity: async (categoryId, itemId, newQuantity, type, movementQty, note, orderId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const op = getCurrentOperator();
        const { error: errorProduto } = await supabase.from('produtos').update({ quantidade: newQuantity }).eq('id', itemId).eq('workspace_id', workspaceId); 
        if (errorProduto) return;
        const { data: dataMovimentacao, error: errorMovimentacao } = await supabase.from('movimentacoes').insert([{
              workspace_id: workspaceId, produto_id: itemId, tipo: type, quantidade: movementQty, novo_total: newQuantity,
              observacao: note, pedido_id: orderId || null, operador_id: op.id !== 'admin' ? op.id : null, nome_operador: op.name || 'Desconhecido', data: new Date().toISOString()
        }]).select();

        if (!errorMovimentacao && dataMovimentacao && dataMovimentacao[0]) {
          const newEntry: HistoryEntry = { id: dataMovimentacao[0].id, type, quantity: movementQty, date: dataMovimentacao[0].data, newTotal: newQuantity, note, orderId, operatorId: op.id, operatorName: op.name || 'Desconhecido' };
          set((state) => ({ categories: state.categories.map((cat) => cat.id === categoryId ? { ...cat, items: cat.items.map((item) => item.id === itemId ? { ...item, quantity: newQuantity, history:[...item.history, newEntry] } : item ) } : cat ) }));
        }
      },

      // -- CATEGORIAS --
      addCategory: async (category) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { data, error } = await supabase.from('categorias').insert([{ nome: category.name, workspace_id: workspaceId }]).select();
        if (!error && data && data[0]) {
          const newCategory: Category = { id: data[0].id, name: data[0].nome, items:[] };
          set((state) => ({ categories:[...state.categories, newCategory], selectedCategoryId: state.selectedCategoryId || newCategory.id }));
        }
      },
      updateCategory: async (categoryId, name) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('categorias').update({ nome: name }).eq('id', categoryId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ categories: state.categories.map((cat) => cat.id === categoryId ? { ...cat, name } : cat ) }));
      },
      removeCategory: async (categoryId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('categorias').delete().eq('id', categoryId).eq('workspace_id', workspaceId);
        if (!error) {
          set((state) => {
            const newCategories = state.categories.filter((c) => c.id !== categoryId)
            return { categories: newCategories, selectedCategoryId: state.selectedCategoryId === categoryId ? newCategories[0]?.id || null : state.selectedCategoryId }
          })
        }
      },

      clearHistory: async () => {}, // Gerenciado pelo Supabase automaticamente

      // -- FORNECEDORES (SUPABASE) --
      addSupplier: async (supplier) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { data, error } = await supabase.from('fornecedores').insert([{ workspace_id: workspaceId, nome: supplier.name, contato: supplier.contact, telefone: supplier.phone, email: supplier.email, endereco: supplier.address }]).select();
        if (!error && data && data[0]) {
          const newSupplier: Supplier = { id: data[0].id, name: data[0].nome, contact: data[0].contato || '', phone: data[0].telefone || '', email: data[0].email || '', address: data[0].endereco || '' };
          set((state) => ({ suppliers: [...state.suppliers, newSupplier] }));
        }
      },
      updateSupplier: async (supplierId, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.nome = updates.name;
        if (updates.contact !== undefined) dbUpdates.contato = updates.contact;
        if (updates.phone !== undefined) dbUpdates.telefone = updates.phone;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.address !== undefined) dbUpdates.endereco = updates.address;
        const { error } = await supabase.from('fornecedores').update(dbUpdates).eq('id', supplierId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ suppliers: state.suppliers.map((s) => (s.id === supplierId ? { ...s, ...updates } : s)) }));
      },
      removeSupplier: async (supplierId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('fornecedores').delete().eq('id', supplierId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ suppliers: state.suppliers.filter((s) => s.id !== supplierId) }));
      },

      // -- LOCAIS DE ESTOQUE (SUPABASE) --
      addLocation: async (location) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const itemRefsString = JSON.stringify(location.itemRefs ||[]);
        const { data, error } = await supabase.from('locais_estoque').insert([{ workspace_id: workspaceId, nome: location.name, descricao: location.description, item_refs: itemRefsString }]).select();
        if (!error && data && data[0]) {
          const newLocation: StockLocation = { id: data[0].id, name: data[0].nome, description: data[0].descricao || '', itemRefs: location.itemRefs || [] };
          set((state) => ({ locations:[...state.locations, newLocation] }));
          return data[0].id;
        }
        return "";
      },
      updateLocation: async (locationId, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.nome = updates.name;
        if (updates.description !== undefined) dbUpdates.descricao = updates.description;
        if (updates.itemRefs !== undefined) dbUpdates.item_refs = JSON.stringify(updates.itemRefs);
        const { error } = await supabase.from('locais_estoque').update(dbUpdates).eq('id', locationId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ locations: state.locations.map((l) => (l.id === locationId ? { ...l, ...updates } : l)) }));
      },
      removeLocation: async (locationId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('locais_estoque').delete().eq('id', locationId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ locations: state.locations.filter((l) => l.id !== locationId) }));
      },
      toggleLocationItem: async (locationId, ref) => {
        const loc = get().locations.find(l => l.id === locationId);
        if (!loc) return;
        const has = loc.itemRefs.includes(ref);
        const newRefs = has ? loc.itemRefs.filter(r => r !== ref) : [...loc.itemRefs, ref];
        
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('locais_estoque').update({ item_refs: JSON.stringify(newRefs) }).eq('id', locationId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ locations: state.locations.map((l) => (l.id === locationId ? { ...l, itemRefs: newRefs } : l)) }));
      },

      // -- PEDIDOS (MIGRAÇÃO SUPABASE) --
      addOrder: async (order) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        
        const { data, error } = await supabase.from('pedidos').insert([{ 
          workspace_id: workspaceId, fornecedor_id: order.supplierId, produto_id: order.linkedItemId || null,
          categoria_id: order.linkedCategoryId || null, unidade: order.unit, quantidade_pedida: order.quantityOrdered, 
          data_esperada: order.expectedDate, status_prazo: order.deadlineStatus, status_entrega: order.deliveryStatus, observacoes: order.notes 
        }]).select();

        if (!error && data && data[0]) {
          const newOrder: Order = { ...order, id: data[0].id, deliveries: [] };
          set((state) => ({ orders:[newOrder, ...state.orders] }));
        }
      },

      updateOrder: async (orderId, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const dbUp: any = {};
        if (updates.expectedDate !== undefined) dbUp.data_esperada = updates.expectedDate;
        if (updates.notes !== undefined) dbUp.observacoes = updates.notes;
        
        const { error } = await supabase.from('pedidos').update(dbUp).eq('id', orderId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ orders: state.orders.map((o) => (o.id === orderId ? { ...o, ...updates } : o)) }));
      },

      removeOrder: async (orderId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('pedidos').delete().eq('id', orderId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId) }));
      },

      registerDelivery: async ({ orderId, deliveryDate, quantityDelivered, stockEntryQuantity, notes, createStockEntry }) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const state = get();
        const order = state.orders.find((o) => o.id === orderId);
        if (!order) return;

        const totalDelivered = order.quantityDelivered + quantityDelivered;
        const deadline = calcDeadlineStatus(order.expectedDate, deliveryDate);
        const delivStatus = calcDeliveryStatus(order.quantityOrdered, totalDelivered);

        // Salva a Entrega
        const { data: delivData, error: delivErr } = await supabase.from('entregas_pedido').insert([{
          workspace_id: workspaceId, pedido_id: orderId, data: deliveryDate, quantidade: quantityDelivered, 
          quantidade_estoque: stockEntryQuantity, observacoes: notes, gerou_entrada_estoque: createStockEntry
        }]).select();

        if (delivErr) return;

        // Atualiza o Pedido
        await supabase.from('pedidos').update({
          quantidade_entregue: totalDelivered, status_prazo: deadline, status_entrega: delivStatus,
          entrada_estoque_criada: createStockEntry ? true : order.stockEntryCreated
        }).eq('id', orderId).eq('workspace_id', workspaceId);

        // Se pediu pra dar entrada no estoque, chama a função que já temos pronta
        if (createStockEntry && order.linkedCategoryId && order.linkedItemId && stockEntryQuantity && stockEntryQuantity > 0) {
           const currentItem = state.categories.find(c => c.id === order.linkedCategoryId)?.items.find(i => i.id === order.linkedItemId);
           if (currentItem) {
              const newQty = currentItem.quantity + stockEntryQuantity;
              const msg = `Pedido #${orderId.slice(-6).toUpperCase()} — ${quantityDelivered} entregues`;
              await state.updateItemQuantity(order.linkedCategoryId, order.linkedItemId, newQty, 'entrada', stockEntryQuantity, msg, orderId);
           }
        }
        await state.initialize(); // Puxa tudo limpo do banco para atualizar a tela
      },

      updateDelivery: async () => { /* Em SaaS complexo, a edição de entrega é bloqueada. O usuário deleta e faz de novo. */ },

      finalizeOrder: async (orderId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const { error } = await supabase.from('pedidos').update({ status_entrega: 'Entrega Completa' }).eq('id', orderId).eq('workspace_id', workspaceId);
        if (!error) set((state) => ({ orders: state.orders.map((o) => o.id === orderId ? { ...o, deliveryStatus: 'Entrega Completa' } : o ) }));
      },

      // -- ETIQUETAS QR (SUPABASE) --
      setQrAlias: async (key, alias) => {
        const { supabase } = await import('./supabase');
        const workspaceId = "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        const catId = alias.kind === 'item' ? alias.categoryId : null;
        const itId = alias.kind === 'item' ? alias.itemId : null;
        const locId = alias.kind === 'location' ? alias.locationId : null;

        await supabase.from('aliases_qr').insert([{ workspace_id: workspaceId, chave: key, tipo: alias.kind, categoria_id: catId, item_id: itId, location_id: locId }]);
        set((state) => ({ qrAliases: { ...state.qrAliases,[key]: alias } }));
      },

      removeQrAlias: async (key) => {
        const { supabase } = await import('./supabase');
        await supabase.from('aliases_qr').delete().eq('chave', key).eq('workspace_id', "0356ee6f-c655-4ae8-ad91-ff82703e07e9");
        set((state) => { const next = { ...state.qrAliases }; delete next[key]; return { qrAliases: next }; });
      },
    }),
    { name: 'estoque-local-v2' }
  )
)