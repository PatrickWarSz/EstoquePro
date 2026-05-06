import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ModuleKey = "estoque" | "pedidos" | "fornecedores" | "historico" | "scanner" | "etiquetas" | "configuracoes"

export const fullPermissions = () => ({
  estoque: true, pedidos: true, fornecedores: true, historico: true, scanner: true, etiquetas: true, configuracoes: true,
})

export interface Employee {
  id: string; username: string; passwordHash: string; name: string; permissions: any; active: boolean; createdAt: string;
}

export interface AdminAccount {
  username: string; passwordHash: string; name: string; companyName?: string;
}

export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: any }
  | { kind: "employee"; id: string; name: string; username: string; permissions: any }
  | null

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password)
  const buf = await crypto.subtle.digest("SHA-256", enc)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

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
  getCurrentUser: () => CurrentUser
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
        const passwordHash = await hashPassword(password);
        const cleanDoc = documentId.replace(/\D/g, '');

        // 1. Cria Workspace
        const { data: workspace, error: wErr } = await supabase
          .from('workspaces')
          .insert([{ cnpj_cpf: cleanDoc, nome_empresa: companyName }])
          .select().single();
        if (wErr) throw wErr;

        // 2. Cria Usuário Admin
        const { error: uErr } = await supabase
          .from('usuarios')
          .insert([{
            workspace_id: workspace.id,
            nome: name,
            username: username.toLowerCase(),
            tipo: 'admin',
            permissoes: fullPermissions(),
            ativo: true,
            senha_hash: passwordHash
          }]);
        if (uErr) throw uErr;

        set({
          admin: { username, passwordHash, name, companyName },
          currentUserId: "admin",
          workspaceId: workspace.id
        });
      },

      login: async (username, password) => {
        const { supabase } = await import('./supabase');
        const u = username.trim().toLowerCase();
        const hash = await hashPassword(password);

        const { data: user, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('username', u)
          .single();

        if (error || !user || user.senha_hash !== hash) {
          return { ok: false, error: "Usuário ou senha incorretos." };
        }

        const { data: team } = await supabase
          .from('usuarios')
          .select('*')
          .eq('workspace_id', user.workspace_id)
          .eq('tipo', 'funcionario');

        const emps: Employee[] = (team || []).map(e => ({
          id: e.id, username: e.username, passwordHash: e.senha_hash, name: e.nome, permissions: e.permissoes, active: e.ativo, createdAt: e.criado_em
        }));

        set({
          currentUserId: user.tipo === 'admin' ? 'admin' : user.id,
          workspaceId: user.workspace_id,
          admin: user.tipo === 'admin' ? { username: user.username, passwordHash: user.senha_hash, name: user.nome } : null,
          employees: emps
        });

        return { ok: true };
      },

      logout: () => set({ currentUserId: null, workspaceId: null, admin: null, employees: [] }),

      addEmployee: async ({ username, password, name, permissions }) => {
        const { supabase } = await import('./supabase');
        const hash = await hashPassword(password);
        const { data, error } = await supabase
          .from('usuarios')
          .insert([{
            workspace_id: get().workspaceId,
            nome: name,
            username: username.toLowerCase(),
            tipo: 'funcionario',
            permissoes: permissions,
            ativo: true,
            senha_hash: hash
          }])
          .select().single();

        if (error) return { ok: false, error: error.message };

        const newEmp: Employee = {
          id: data.id, username: data.username, passwordHash: hash, name: data.nome, permissions: data.permissoes, active: data.ativo, createdAt: data.criado_em
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
        await supabase.from('usuarios').delete().eq('id', id);
        set({ employees: get().employees.filter(e => e.id !== id) });
      },

      getCurrentUser: () => {
        const { admin, employees, currentUserId } = get();
        if (currentUserId === 'admin' && admin) return { kind: 'admin', id: 'admin', ...admin, permissions: fullPermissions() };
        const emp = employees.find(e => e.id === currentUserId);
        return emp ? { kind: 'employee', ...emp } : null;
      }
    }),
    { name: "estoque-auth-v1" }
  )
)