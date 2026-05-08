import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"

export type ModuleKey = "estoque" | "pedidos" | "fornecedores" | "historico" | "scanner" | "etiquetas" | "configuracoes"

// Definição do tipo Permissions que a FuncionariosPage estava pedindo
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
  setupAdmin: (input: { username: string; password: string; name: string; companyName?: string; documentId: string }) => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
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
      employees: [],
      currentUserId: null,
      workspaceId: null,

      setupAdmin: async ({ username, password, name, companyName, documentId }) => {
        const { supabase } = await import('./supabase');
        const cleanDoc = documentId.replace(/\D/g, '');
        const u = username.toLowerCase().trim();
        const virtualEmail = `${u}@${cleanDoc}.vexo`;

        const { data: workspace, error: wErr } = await supabase
          .from('workspaces')
          .insert([{ cnpj_cpf: cleanDoc, nome_empresa: companyName }])
          .select().single();
        if (wErr) throw wErr;

        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: virtualEmail,
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

        set({
          admin: { username: u, passwordHash: 'migrated', name, companyName },
          currentUserId: authData.user?.id || "admin",
          workspaceId: workspace.id
        });
      },

      login: async (username, password) => {
        const { supabase } = await import('./supabase');
        const u = username.trim().toLowerCase();

        const { data: user, error: dbErr } = await supabase
          .from('usuarios')
          .select('*')
          .eq('username', u)
          .single();

        if (dbErr || !user) {
          return { ok: false, error: "Usuário ou senha incorretos." };
        }

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('cnpj_cpf')
          .eq('id', user.workspace_id)
          .single();

        const cnpjCpf = workspace?.cnpj_cpf || '00000000000000';
        const virtualEmail = `${u}@${cnpjCpf}.vexo`;

        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: virtualEmail,
          password: password,
        });

        if (authErr || !authData.user) {
          return { ok: false, error: "Usuário ou senha incorretos." };
        }

        set({
          currentUserId: user.id,
          workspaceId: user.workspace_id,
          admin: user.tipo === 'admin' ? { username: user.username, passwordHash: 'migrated', name: user.nome } : null,
          employees: []
        });

        return { ok: true };
      },

      logout: () => {
        import('./supabase').then(({ supabase }) => {
          supabase.auth.signOut().then(() => {
            set({ currentUserId: null, workspaceId: null, admin: null, employees: [] });
          });
        });
      },

      addEmployee: async ({ username, password, name, permissions }) => {
        const { supabase } = await import('./supabase');
        const u = username.toLowerCase().trim();

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('cnpj_cpf')
          .eq('id', get().workspaceId)
          .single();

        const cnpjCpf = workspace?.cnpj_cpf || '00000000000000';
        const virtualEmail = `${u}@${cnpjCpf}.vexo`;

        const { createClient } = await import('@supabase/supabase-js');
        const tempClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
          { auth: { persistSession: false } }
        );

        const { data: authData, error: authErr } = await tempClient.auth.signUp({
          email: virtualEmail,
          password: password,
        });

        if (authErr) return { ok: false, error: authErr.message };

        const { data, error } = await supabase
          .from('usuarios')
          .insert([{
            id: authData.user?.id,
            workspace_id: get().workspaceId,
            nome: name,
            username: u,
            tipo: 'funcionario',
            permissoes: permissions,
            ativo: true,
            senha_hash: 'migrated_to_auth'
          }])
          .select().single();

        if (error) return { ok: false, error: error.message };

        const newEmp: Employee = {
          id: data.id, username: data.username, passwordHash: 'migrated', name: data.nome, permissions: data.permissoes, active: data.ativo, createdAt: data.criado_em
        };

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
        // Nota: O reset de senha de terceiros via Client SDK é restrito por segurança no Supabase.
        // O ideal é usar Edge Functions. Por enquanto, apenas notificamos o Admin.
        toast.info("Para resetar a senha deste funcionário, use o painel administrativo do Supabase ou configure uma Edge Function.");
        console.log(`Solicitação de reset para ID: ${id} com nova senha: ${newPassword}`);
      },

      getCurrentUser: () => {
        const { admin, employees, currentUserId } = get();
        if (admin) return { kind: 'admin', id: 'admin', ...admin, permissions: fullPermissions() };
        const emp = employees.find(e => e.id === currentUserId);
        return emp ? { kind: 'employee', ...emp } : null;
      },

      fetchEmployees: async () => {
        const { supabase } = await import('./supabase');
        const currentWorkspaceId = get().workspaceId;
        if (!currentWorkspaceId) return;
        
        const { data } = await supabase
          .from('usuarios')
          .select('*')
          .eq('workspace_id', currentWorkspaceId)
          .eq('tipo', 'funcionario');
          
        if (data) {
          const emps: Employee[] = data.map((e: any) => ({
            id: e.id,
            username: e.username,
            passwordHash: 'migrated',
            name: e.nome,
            permissions: e.permissoes,
            active: e.ativo,
            createdAt: e.criado_em
          }));
          set({ employees: emps });
        }
      }
    }),
    { 
      name: "estoque-auth-v1",
      partialize: (state) => ({ 
        currentUserId: state.currentUserId, 
        workspaceId: state.workspaceId, 
        admin: state.admin 
      })
    }
  )
)