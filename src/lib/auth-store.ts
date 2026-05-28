import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"

export type ModuleKey = "estoque" | "pedidos" | "fornecedores" | "historico" | "scanner" | "etiquetas" | "configuracoes"
export type Permissions = Record<ModuleKey, boolean>;

export const ALL_MODULES: { key: ModuleKey; label: string; description: string }[] =[
  { key: "estoque", label: "Estoque", description: "Visualizar e movimentar itens" },
  { key: "pedidos", label: "Pedidos", description: "Criar e registrar entregas" },
  { key: "fornecedores", label: "Fornecedores", description: "Gerenciar fornecedores" },
  { key: "historico", label: "Histórico", description: "Ver histórico geral" },
  { key: "scanner", label: "Scanner QR", description: "Ler QR para entrada/saída" },
  { key: "etiquetas", label: "Etiquetas QR", description: "Gerar e imprimir etiquetas" },
  { key: "configuracoes", label: "Configurações", description: "Ajustes do sistema" },
]

export const emptyPermissions = (): Permissions => ({
  estoque: false, pedidos: false, fornecedores: false, historico: false, scanner: false, etiquetas: false, configuracoes: false,
})

export const fullPermissions = (): Permissions => ({
  estoque: true, pedidos: true, fornecedores: true, historico: true, scanner: true, etiquetas: true, configuracoes: true,
})

export interface Employee {
  id: string; username: string; passwordHash: string; name: string; permissions: Permissions; active: boolean; isAdmin: boolean; createdAt: string;
}

export interface AdminAccount {
  username: string; passwordHash: string; name: string; companyName?: string;
}

export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: Permissions; isAdmin: true }
  | { kind: "employee"; id: string; name: string; username: string; permissions: Permissions; isAdmin: boolean }
  | null

interface AuthState {
  admin: AdminAccount | null
  employees: Employee[]
  employeeCursor?: string | null
  employeesHasMore?: boolean
  currentUserId: string | null 
  workspaceId: string | null 
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null
  expiryDate: string | null
  asaasPortalUrl: string | null
  isInitializing: boolean 
  _realtimeSubscription?: any 
  _healthCheckInterval?: NodeJS.Timeout
  
  setupAdmin: (input: { username: string; password: string; name: string; companyName?: string; documentId: string; ownerCpf?: string; phone?: string }) => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>
  refreshSubscription: () => Promise<void>
  backupWorkspace: () => Promise<{ ok: boolean; id?: string; error?: string }>
  addEmployee: (input: { username: string; password: string; name: string; permissions: any; isAdmin?: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateEmployee: (id: string, updates: Partial<Employee>) => void
  removeEmployee: (id: string) => Promise<void>
  resetEmployeePassword: (id: string, newPassword: string) => Promise<void>
  getCurrentUser: () => CurrentUser
  fetchEmployees: (limit?: number, append?: boolean) => Promise<void>
  _setupAccessControl: () => void
  _cleanupAccessControl: () => void
  initializeFromSupabase: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isInitializing: true,
      admin: null,
      employees:[],
      currentUserId: null,
      workspaceId: null,
      subscriptionStatus: null,
      expiryDate: null,       
      asaasPortalUrl: null, // NOVA LINHA: Inicia vazio

      setupAdmin: async ({ username, password, name, companyName, documentId, ownerCpf, phone }) => { 
        const { supabase } = await import('./supabase');
        const cleanDoc = documentId.replace(/\D/g, '');
        const cleanCpf = ownerCpf ? ownerCpf.replace(/\D/g, '') : cleanDoc;
        const u = username.toLowerCase().trim();
        
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 15);
        
        const { data: workspace, error: wErr } = await supabase
          .from('workspaces')
          .insert([{ 
            cnpj_cpf: cleanDoc, 
            nome_empresa: companyName,
            cpf_titular: cleanCpf,
            status_assinatura: 'trialing',
            plano_atual: 'estoque_pro',
            data_vencimento: trialEndDate.toISOString()
          }])
          .select().single();
        if (wErr) throw wErr;

        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: u,
          password: password,
        });
        if (authErr) throw authErr;

        const { error: uErr } = await supabase
          .from('usuarios')
          .insert([{
            id: authData.user?.id,
            workspace_id: workspace.id,
            nome: name,
            username: u, 
            tipo: 'admin',
            permissoes: fullPermissions(),
            ativo: true,
            senha_hash: 'migrated_to_auth'
          }]);
        if (uErr) throw uErr;

      try {
          // SEGURANÇA: Passar o token JWT para autenticar a Edge Function
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          
          await supabase.functions.invoke('asaas-customer', {
            body: { workspaceId: workspace.id, companyName, documentId: cleanDoc, email: u, phone },
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (err) { 
          console.error("Erro ao criar cliente Asaas (erro não-crítico):", (err as Error).message); 
        }

        set({
          admin: { username: u, passwordHash: 'migrated', name, companyName },
          currentUserId: authData.user?.id || "admin",
          workspaceId: workspace.id,
          subscriptionStatus: 'trialing',
          expiryDate: trialEndDate.toISOString(),
          asaasPortalUrl: null
        });
      },

      login: async (username, password) => {
        const { supabase } = await import('./supabase')
        const EMPLOYEE_LOGIN_FN =
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/employee-login`

        try {
          const res = await fetch(EMPLOYEE_LOGIN_FN, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ login: username.trim(), password }),
          })

          const data = await res.json()
          if (!res.ok || data.error) {
            return { ok: false, error: data.error ?? 'Usuário ou senha incorretos.' }
          }

          // Injeta a sessão — dispara cookieStorage (SSO entre subdomínios)
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          })
          if (sessionErr) return { ok: false, error: 'Erro ao estabelecer sessão.' }

          const u = data.user
          set({
            currentUserId: u.id,
            workspaceId: u.workspace_id,
            subscriptionStatus: 'trialing',
            expiryDate: null,
            asaasPortalUrl: null,
            admin: u.tipo === 'admin'
              ? { username: u.email, passwordHash: 'migrated', name: u.nome }
              : null,
            employees: [],
          })

          // Atualiza status real da assinatura
          await get().refreshSubscription()

          // Ativa monitoramento em tempo real
          get()._setupAccessControl()

          return { ok: true }
        } catch (err: any) {
          console.error('[login]', err)
          return { ok: false, error: 'Não foi possível conectar. Verifique sua internet.' }
        }
      },

      refreshSubscription: async () => {
        try {
          const { supabase } = await import('./supabase');
          const workspaceId = get().workspaceId;
          if (!workspaceId) return;

          // NOVA LINHA: Busca o asaas_portal_url também
          const { data, error } = await supabase
            .from('workspaces')
            .select('status_assinatura, data_vencimento, asaas_portal_url')
            .eq('id', workspaceId)
            .single();

          if (data && !error) {
            set({
              subscriptionStatus: data.status_assinatura,
              expiryDate: data.data_vencimento,
              asaasPortalUrl: data.asaas_portal_url // NOVA LINHA: Atualiza a memória
            });
          }
        } catch (err) {
          console.error("Falha ao sincronizar assinatura:", err);
        }
      },

      backupWorkspace: async () => {
        try {
          const { supabase } = await import('./supabase');
          const workspaceId = get().workspaceId;
          if (!workspaceId) return { ok: false, error: 'No workspace' };

          const [usuariosRes, produtosRes, categoriasRes, movimentacoesRes, locaisRes, pedidosRes, fornecedoresRes] = await Promise.all([
            supabase.from('usuarios').select('*').eq('workspace_id', workspaceId),
            supabase.from('produtos').select('*').eq('workspace_id', workspaceId),
            supabase.from('categorias').select('*').eq('workspace_id', workspaceId),
            supabase.from('movimentacoes').select('*').eq('workspace_id', workspaceId),
            supabase.from('locais_estoque').select('*').eq('workspace_id', workspaceId),
            supabase.from('pedidos').select('*').eq('workspace_id', workspaceId),
            supabase.from('fornecedores').select('*').eq('workspace_id', workspaceId),
          ]);

          const backup = {
            workspaceId,
            timestamp: new Date().toISOString(),
            usuarios: usuariosRes.data || [],
            produtos: produtosRes.data || [],
            categorias: categoriasRes.data || [],
            movimentacoes: movimentacoesRes.data || [],
            locais_estoque: locaisRes.data || [],
            pedidos: pedidosRes.data || [],
            fornecedores: fornecedoresRes.data || [],
          };

          const id = `backup-${Date.now()}`;
          const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
          const path = `${workspaceId}/${id}.json`;
          const { error: upErr } = await supabase.storage.from('backups').upload(path, blob);
          if (upErr) return { ok: false, error: upErr.message };
          await supabase.from('backups').insert([{ id, workspace_id: workspaceId, tamanho: blob.size, data_criacao: backup.timestamp }]);
          return { ok: true, id };
        } catch (err: any) {
          console.error('[backupWorkspace]', err);
          return { ok: false, error: err?.message || String(err) };
        }
      },

      logout: () => {
        // SEGURANÇA: Limpar listeners de acesso antes de logout
        get()._cleanupAccessControl();
        
        import('./supabase').then(({ supabase }) => {
          supabase.auth.signOut().then(() => {
            set({ currentUserId: null, workspaceId: null, admin: null, employees:[], subscriptionStatus: null, expiryDate: null, asaasPortalUrl: null });
          });
        });
      },

      addEmployee: async (input) => {
  const { username, password, name, permissions } = input
  const { supabase } = await import('./supabase');
  const workspaceId = get().workspaceId;
  if (!workspaceId) return { ok: false, error: "Sessão inválida. Faça login novamente." };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "Sessão expirada. Faça login novamente." };

    const { data, error } = await supabase.functions.invoke('create-employee-auth', {
      body: { username, password, name, permissions, isAdmin: input.isAdmin || false, workspaceId },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || !data?.success) {
      return { ok: false, error: data?.error || error?.message || "Erro ao criar funcionário." };
    }

    // Rebuscar o funcionário recém-criado para hidratar o estado local
    const { data: newUserData } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', data.id)
      .single();

    if (newUserData) {
      const newEmp: Employee = {
        id: newUserData.id,
        username: newUserData.username,
        passwordHash: 'migrated',
        name: newUserData.nome,
        permissions: newUserData.permissoes,
        active: newUserData.ativo,
        isAdmin: newUserData.is_admin || false,
        createdAt: newUserData.criado_em,
      };
      set({ employees: [...get().employees, newEmp] });
    }

    return { ok: true, id: data.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Erro inesperado ao criar funcionário." };
  }
},

      updateEmployee: async (id, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId;
        
        // SEGURANÇA: Validar que o funcionário pertence a este workspace antes de atualizar
        const { data: emp, error: checkErr } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .single();
        
        if (checkErr || !emp) {
          console.error('[updateEmployee] Tentativa de acesso não autorizado');
          return; // Silenciosamente falha - não vaza que o recurso não existe
        }
        
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.nome = updates.name;
        if (updates.permissions) dbUpdates.permissoes = updates.permissions;
        if (updates.active !== undefined) dbUpdates.ativo = updates.active;
        if (updates.isAdmin !== undefined) dbUpdates.is_admin = updates.isAdmin;
        
        await supabase
          .from('usuarios')
          .update(dbUpdates)
          .eq('id', id)
          .eq('workspace_id', workspaceId);
        
        set({ employees: get().employees.map(e => e.id === id ? { ...e, ...updates } : e) });
      },

      removeEmployee: async (id) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId;

        // SEGURANÇA: Confirmar que o funcionário pertence ao workspace
        const { data: emp, error: checkErr } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .single();

        if (checkErr || !emp) {
          console.error('[removeEmployee] Tentativa de acesso não autorizado');
          return;
        }

        // 1. Soft delete no banco — preserva histórico de movimentações (CORREÇÃO APLICADA AQUI)
        await supabase
          .from('usuarios')
          .update({ ativo: false, deleted_at: new Date().toISOString() })
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        // 2. Remover do Supabase Auth — impede login futuro
        // Usa service role via Edge Function (anon key não tem permissão para isso)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await supabase.functions.invoke('delete-auth-user', {
            body: { userId: id },
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
        } catch (err) {
          console.error('[removeEmployee] Erro ao remover do Auth (não crítico):', err);
        }

        // 3. Remove do estado local
        set({ employees: get().employees.filter(e => e.id !== id) });
      },

      resetEmployeePassword: async (id, newPassword) => {
  const { supabase } = await import('./supabase');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }

    const { data, error } = await supabase.functions.invoke('reset-employee-password', {
      body: { employeeId: id, newPassword },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || !data?.success) {
      toast.error(data?.error || "Erro ao redefinir senha.");
      return;
    }

    toast.success("Senha redefinida com sucesso.");
  } catch (err: any) {
    toast.error(err?.message || "Erro inesperado ao redefinir senha.");
  }
},
      resetPassword: async (email) => {
        const { supabase } = await import('./supabase');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
        return error ? { ok: false, error: error.message } : { ok: true };
      },

      getCurrentUser: () => {
  const { admin, employees, currentUserId } = get();
  if (!currentUserId) return null;

  // Se o objeto 'admin' estiver preenchido no estado, o usuário logado é o Administrador
  if (admin) {
    return { 
      kind: 'admin', 
      id: currentUserId, // Usa o UUID real dele do banco
      ...admin, 
      permissions: fullPermissions(), 
      isAdmin: true 
    };
  }

  // Caso contrário, procura o registro na lista de funcionários
  const emp = employees.find(e => e.id === currentUserId);
  return emp ? { kind: 'employee', ...emp } : null;
},
      fetchEmployees: async (limit = 50, append = false) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        // Order by creation date desc, use cursor (criado_em) for pagination
        let query: any = supabase
          .from('usuarios')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('tipo', 'funcionario')
          .is('deleted_at', null)
          .order('criado_em', { ascending: false })
          .limit(limit);

        const cursor = get().employeeCursor;
        if (cursor && append) {
          // fetch next page older than cursor
          query = query.gt('criado_em', cursor);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[fetchEmployees] error', error);
          return;
        }

        if (!data || data.length === 0) {
          // no more
          set({ employeesHasMore: false });
          return;
        }

        const emps: Employee[] = data.map((e: any) => ({
          id: e.id,
          username: e.username,
          passwordHash: 'migrated',
          name: e.nome,
          permissions: e.permissoes,
          active: e.ativo,
          isAdmin: e.is_admin || false,
          createdAt: e.criado_em,
        }));

        const nextCursor = data[data.length - 1]?.criado_em || null;

        if (append) {
          set({ employees: [...get().employees, ...emps], employeeCursor: nextCursor, employeesHasMore: data.length === limit });
        } else {
          set({ employees: emps, employeeCursor: nextCursor, employeesHasMore: data.length === limit });
        }
      },

      // SEGURANÇA: Configurar monitoramento de acesso em tempo real + healthcheck
      _setupAccessControl: async () => {
        const { supabase } = await import('./supabase');
        const state = get();
        
        // Limpar qualquer listener/interval anterior
        get()._cleanupAccessControl();

        // Se for admin, não monitorar
        if (state.currentUserId === 'admin') return;

        const userId = state.currentUserId;
        if (!userId) return;

        // 1. REAL-TIME: Escutar mudanças
        try {
          const subscription = supabase
            .channel(`usuarios-${userId}`)
            .on(
              'postgres_changes' as any,
              { event: '*', schema: 'public', table: 'usuarios', filter: `id=eq.${userId}` },
              (payload: any) => {
                const userData = payload.new;
                if (userData && userData.ativo === false) {
                  toast.error('Seu acesso foi revogado pelo administrador.');
                  get().logout();
                }
              }
            )
            .subscribe();

          set({ _realtimeSubscription: subscription } as any);
        } catch (err) {
          console.error('Erro ao configurar real-time listener:', err);
        }

       // 2. HEALTHCHECK: Validar no foco da aba (quando o usuário volta para a janela)
// + fallback de 60s para tabs em background sem WebSocket ativo
const checkAccess = async () => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('ativo')
      .eq('id', userId)
      .single();
    if (error || !data?.ativo) {
      toast.error('Seu acesso foi revogado. Faça login novamente.');
      get().logout();
    }
  } catch (err) {
    console.error('Erro no healthcheck de acesso:', err);
  }
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkAccess();
});

const healthCheckInterval = setInterval(checkAccess, 60000);

        set({ _healthCheckInterval: healthCheckInterval } as any);
      },

      _cleanupAccessControl: () => {
        const state = get();
        
        if (state._realtimeSubscription) {
          try {
            state._realtimeSubscription.unsubscribe();
          } catch (err) {
            console.error('Erro ao unsubscribe:', err);
          }
        }
        
        if (state._healthCheckInterval) {
          clearInterval(state._healthCheckInterval);
        }

        set({ _realtimeSubscription: undefined, _healthCheckInterval: undefined } as any);
      },

      // SEGURANÇA: Inicializar sessão a partir do Supabase Auth (SSO multi-app)
     initializeFromSupabase: async () => {
        set({ isInitializing: true }); // <--- 3. Avisa que começou a checar a sessão
        try {
          const { supabase } = await import('./supabase');
          
          // 1. Buscar sessão ativa do Supabase
          const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
          
          if (sessionErr || !session?.user) {
            console.log('[initializeFromSupabase] Nenhuma sessão ativa encontrada');
            set({ isInitializing: false }); // <--- Finaliza se não achar sessão
            return;
          }

          const userId = session.user.id;
          
          // 2. Buscar dados do usuário no banco
          const { data: user, error: dbErr } = await supabase
            .from('usuarios')
            .select('*, workspaces(status_assinatura, data_vencimento, asaas_portal_url, cnpj_cpf)')
            .eq('id', userId)
            .single();

          if (dbErr || !user) {
            console.error('[initializeFromSupabase] Usuário não encontrado no banco:', dbErr);
            set({ isInitializing: false }); // <--- Finaliza se não achar usuário
            return;
          }

          if (!user.ativo) {
            console.warn('[initializeFromSupabase] Usuário inativo');
            set({ isInitializing: false }); // <--- Finaliza se o usuário estiver inativo
            return;
          }

          // 3. Hidratar o estado do auth-store
const ws = user.workspaces as any;
set({
  currentUserId: user.id, // <--- Alterado aqui também para manter a consistência no refresh
  workspaceId: user.workspace_id,
  subscriptionStatus: ws?.status_assinatura || 'trialing',
  expiryDate: ws?.data_vencimento || null,
  asaasPortalUrl: ws?.asaas_portal_url || null,
  admin: user.tipo === 'admin' 
    ? { username: user.username, passwordHash: 'migrated', name: user.nome } 
    : null,
  employees: []
});

          // 4. Ativar monitoramento de acesso
          get()._setupAccessControl();

          // 5. Escutar evento de logout
          if (typeof window !== 'undefined') {
            const handleSupabaseSignOut = () => {
              get().logout();
            };
            window.removeEventListener('supabase-signed-out', handleSupabaseSignOut);
            window.addEventListener('supabase-signed-out', handleSupabaseSignOut);
          }

          console.log('[initializeFromSupabase] ✅ Sessão restaurada com sucesso');
          set({ isInitializing: false }); // <--- Avisa que terminou com sucesso
        } catch (err) {
          console.error('[initializeFromSupabase] Erro ao inicializar sessão:', err);
          set({ isInitializing: false }); // <--- Finaliza em caso de erro
        }
      }

    }),
    { 
      name: "estoque-auth-v1",
      partialize: (state) => ({ 
        currentUserId: state.currentUserId, 
        workspaceId: state.workspaceId, 
        admin: state.admin,
        subscriptionStatus: state.subscriptionStatus,
        expiryDate: state.expiryDate,
        asaasPortalUrl: state.asaasPortalUrl,
        employees: state.employees,
        employeeCursor: state.employeeCursor,
        employeesHasMore: state.employeesHasMore
      })
    }
  )
)