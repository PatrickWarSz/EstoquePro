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
  id: string; username: string; passwordHash: string; name: string; permissions: Permissions; active: boolean; createdAt: string;
}

export interface AdminAccount {
  username: string; passwordHash: string; name: string; companyName?: string;
}

export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: Permissions }
  | { kind: "employee"; id: string; name: string; username: string; permissions: Permissions }
  | null

interface AuthState {
  admin: AdminAccount | null
  employees: Employee[]
  currentUserId: string | null 
  workspaceId: string | null 
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null
  expiryDate: string | null
  asaasPortalUrl: string | null // NOVA LINHA: URL do Portal
  
  setupAdmin: (input: { username: string; password: string; name: string; companyName?: string; documentId: string; ownerCpf?: string; phone?: string }) => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>
  refreshSubscription: () => Promise<void>
  addEmployee: (input: { username: string; password: string; name: string; permissions: any }) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateEmployee: (id: string, updates: Partial<Employee>) => void
  removeEmployee: (id: string) => void
  resetEmployeePassword: (id: string, newPassword: string) => Promise<void>
  getCurrentUser: () => CurrentUser
  fetchEmployees: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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
        trialEndDate.setDate(trialEndDate.getDate() + 7);
        
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
          await supabase.functions.invoke('asaas-customer', {
            body: { workspaceId: workspace.id, companyName, documentId: cleanDoc, email: u, phone } // Adicionou phone aqui
          });
        } catch (err) { console.error("Erro Asaas:", err); }

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
        const { supabase } = await import('./supabase');
        const u = username.trim().toLowerCase();

        // NOVA LINHA: Adicionado asaas_portal_url na busca
        const { data: user, error: dbErr } = await supabase
          .from('usuarios')
          .select('*, workspaces(status_assinatura, data_vencimento, asaas_portal_url)')
          .eq('username', u)
          .single();

        if (dbErr || !user) return { ok: false, error: "Usuário/E-mail ou senha incorretos." };

        let loginEmail = u;
        if (user.tipo === 'funcionario') {
          const { data: workspace } = await supabase.from('workspaces').select('cnpj_cpf').eq('id', user.workspace_id).single();
          loginEmail = `${u}@${workspace?.cnpj_cpf || '00000000000000'}.vexo`;
        }

        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: password,
        });

        if (authErr || !authData.user) return { ok: false, error: "Usuário/E-mail ou senha incorretos." };

        const ws = user.workspaces as any;
        set({
          currentUserId: user.id,
          workspaceId: user.workspace_id,
          subscriptionStatus: ws?.status_assinatura || 'trialing',
          expiryDate: ws?.data_vencimento || null,
          asaasPortalUrl: ws?.asaas_portal_url || null, // NOVA LINHA: Salva o portal
          admin: user.tipo === 'admin' ? { username: user.username, passwordHash: 'migrated', name: user.nome } : null,
          employees:[]
        });

        return { ok: true };
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

      logout: () => {
        import('./supabase').then(({ supabase }) => {
          supabase.auth.signOut().then(() => {
            set({ currentUserId: null, workspaceId: null, admin: null, employees:[], subscriptionStatus: null, expiryDate: null, asaasPortalUrl: null });
          });
        });
      },

      addEmployee: async ({ username, password, name, permissions }) => {
        const { supabase } = await import('./supabase');
        const u = username.toLowerCase().trim();
        const { data: workspace } = await supabase.from('workspaces').select('cnpj_cpf').eq('id', get().workspaceId).single();
        const virtualEmail = `${u}@${workspace?.cnpj_cpf || '00000000000000'}.vexo`;

        const { createClient } = await import('@supabase/supabase-js');
        const tempClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

        const { data: authData, error: authErr } = await tempClient.auth.signUp({ email: virtualEmail, password });
        if (authErr) return { ok: false, error: authErr.message };

        const { data, error } = await supabase.from('usuarios').insert([{ id: authData.user?.id, workspace_id: get().workspaceId, nome: name, username: u, tipo: 'funcionario', permissoes: permissions, ativo: true, senha_hash: 'migrated_to_auth' }]).select().single();
        if (error) return { ok: false, error: error.message };

        const newEmp: Employee = { id: data.id, username: data.username, passwordHash: 'migrated', name: data.nome, permissions: data.permissoes, active: data.ativo, createdAt: data.criado_em };
        set({ employees: [...get().employees, newEmp] });
        return { ok: true, id: data.id };
      },

      updateEmployee: async (id, updates) => {
        const { supabase } = await import('./supabase');
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.nome = updates.name;
        if (updates.permissions) dbUpdates.permissoes = updates.permissions;
        if (updates.active !== undefined) dbUpdates.ativo = updates.active;
        await supabase.from('usuarios').update(dbUpdates).eq('id', id);
        set({ employees: get().employees.map(e => e.id === id ? { ...e, ...updates } : e) });
      },

      removeEmployee: async (id) => {
        const { supabase } = await import('./supabase');
        await supabase.from('usuarios').update({ ativo: false }).eq('id', id);
        set({ employees: get().employees.map(e => e.id === id ? { ...e, active: false } : e) });
      },

      resetEmployeePassword: async (id, newPassword) => {
        toast.info("O reset de senha de funcionários deve ser feito via painel Supabase.");
      },

      resetPassword: async (email) => {
        const { supabase } = await import('./supabase');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
        return error ? { ok: false, error: error.message } : { ok: true };
      },

      getCurrentUser: () => {
        const { admin, employees, currentUserId } = get();
        if (admin) return { kind: 'admin', id: 'admin', ...admin, permissions: fullPermissions() };
        const emp = employees.find(e => e.id === currentUserId);
        return emp ? { kind: 'employee', ...emp } : null;
      },

      fetchEmployees: async () => {
        const { supabase } = await import('./supabase');
        if (!get().workspaceId) return;
        const { data } = await supabase.from('usuarios').select('*').eq('workspace_id', get().workspaceId).eq('tipo', 'funcionario');
        if (data) {
          const emps: Employee[] = data.map((e: any) => ({ id: e.id, username: e.username, passwordHash: 'migrated', name: e.nome, permissions: e.permissoes, active: e.ativo, createdAt: e.criado_em }));
          set({ employees: emps });
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
        asaasPortalUrl: state.asaasPortalUrl // NOVA LINHA: Guarda a URL localmente
      })
    }
  )
)