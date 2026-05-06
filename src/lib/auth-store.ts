import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ModuleKey =
  | "estoque"
  | "pedidos"
  | "fornecedores"
  | "historico"
  | "scanner"
  | "etiquetas"
  | "configuracoes"

export const ALL_MODULES: { key: ModuleKey; label: string; description: string }[] =[
  { key: "estoque", label: "Estoque", description: "Visualizar e movimentar itens" },
  { key: "pedidos", label: "Pedidos", description: "Criar e registrar entregas" },
  { key: "fornecedores", label: "Fornecedores", description: "Gerenciar fornecedores" },
  { key: "historico", label: "Histórico", description: "Ver histórico geral" },
  { key: "scanner", label: "Scanner QR", description: "Ler QR para entrada/saída" },
  { key: "etiquetas", label: "Etiquetas QR", description: "Gerar e imprimir etiquetas" },
  { key: "configuracoes", label: "Configurações", description: "Ajustes do sistema" },
]

export type Permissions = Record<ModuleKey, boolean>

export const emptyPermissions = (): Permissions => ({
  estoque: false,
  pedidos: false,
  fornecedores: false,
  historico: false,
  scanner: false,
  etiquetas: false,
  configuracoes: false,
})

export const fullPermissions = (): Permissions => ({
  estoque: true,
  pedidos: true,
  fornecedores: true,
  historico: true,
  scanner: true,
  etiquetas: true,
  configuracoes: true,
})

export interface Employee {
  id: string
  username: string
  passwordHash: string
  name: string
  permissions: Permissions
  active: boolean
  createdAt: string
}

export interface AdminAccount {
  username: string
  passwordHash: string
  name: string
  companyName?: string
}

export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: Permissions }
  | { kind: "employee"; id: string; name: string; username: string; permissions: Permissions }
  | null

const id = () => Math.random().toString(36).substring(2, 12) + Date.now().toString(36)

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password)
  const buf = await crypto.subtle.digest("SHA-256", enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

interface AuthState {
  admin: AdminAccount | null
  employees: Employee[]
  currentUserId: string | null 
  workspaceId: string | null 

  setupAdmin: (input: { username: string; password: string; name: string; companyName?: string }) => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void

  addEmployee: (input: { username: string; password: string; name: string; permissions: Permissions }) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateEmployee: (id: string, updates: Partial<Pick<Employee, "name" | "permissions" | "active">>) => void
  resetEmployeePassword: (id: string, newPassword: string) => Promise<void>
  removeEmployee: (id: string) => void

  getCurrentUser: () => CurrentUser
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      employees:[], 
      currentUserId: null,
      workspaceId: null, 

      // -- CRIAR EMPRESA E DONO (SUPABASE) --
      setupAdmin: async ({ username, password, name, companyName }) => {
        const { supabase } = await import('./supabase');
        const passwordHash = await hashPassword(password);
        const cnpjCpfTemporario = username.trim().toLowerCase() + "_cpf"; 

        try {
          const { data: workspaceData, error: workError } = await supabase
            .from('workspaces')
            .insert([{ 
              cnpj_cpf: cnpjCpfTemporario, 
              nome_empresa: companyName || "Minha Empresa" 
            }])
            .select()
            .single();

          if (workError) throw workError;

          const { error: userError } = await supabase
            .from('usuarios')
            .insert([{
              workspace_id: workspaceData.id,
              nome: name.trim(),
              username: username.trim().toLowerCase(),
              tipo: 'admin',
              permissoes: fullPermissions(),
              ativo: true,
              senha_hash: passwordHash // <-- A senha do Dono salva e protegida
            }]);

          if (userError) throw userError;

          set({
            admin: { username: username.trim().toLowerCase(), passwordHash, name: name.trim(), companyName },
            currentUserId: "admin",
            workspaceId: workspaceData.id 
          });

        } catch (error) {
          console.error("Erro ao criar ambiente:", error);
          throw error;
        }
      },

      login: async (username, password) => {
        const u = username.trim().toLowerCase()
        const hash = await hashPassword(password)
        const { admin, employees } = get()
        if (admin && admin.username === u) {
          if (admin.passwordHash !== hash) return { ok: false, error: "Senha incorreta" }
          set({ currentUserId: "admin" })
          return { ok: true }
        }
        const emp = employees.find((e) => e.username === u)
        if (!emp) return { ok: false, error: "Usuário não encontrado" }
        if (!emp.active) return { ok: false, error: "Usuário desativado" }
        if (emp.passwordHash !== hash) return { ok: false, error: "Senha incorreta" }
        set({ currentUserId: emp.id })
        return { ok: true }
      },

      logout: () => set({ currentUserId: null }),

      // -- FUNCIONÁRIOS COM SALVAMENTO CORRIGIDO (SUPABASE) --
      addEmployee: async ({ username, password, name, permissions }) => {
        const u = username.trim().toLowerCase();
        if (!u || !password || !name.trim()) return { ok: false, error: "Preencha todos os campos" };
        
        const { admin, employees, workspaceId } = get();
        if (admin?.username === u) return { ok: false, error: "Usuário já existe" };
        if (employees.some((e) => e.username === u)) return { ok: false, error: "Usuário já existe" };
        
        const passwordHash = await hashPassword(password);
        const { supabase } = await import('./supabase');

        const { data, error } = await supabase.from('usuarios').insert([{
           workspace_id: workspaceId || "0356ee6f-c655-4ae8-ad91-ff82703e07e9",
           nome: name.trim(),
           username: u,
           tipo: 'funcionario',
           permissoes: permissions,
           ativo: true,
           senha_hash: passwordHash // <-- A senha do Funcionário salva com sucesso!
        }]).select();

        if (error || !data) return { ok: false, error: "Erro ao salvar funcionário no banco." };

        const emp: Employee = {
          id: data[0].id,
          username: u,
          passwordHash,
          name: name.trim(),
          permissions,
          active: true,
          createdAt: data[0].criado_em,
        };
        
        set({ employees: [...employees, emp] });
        return { ok: true, id: emp.id };
      },

      updateEmployee: async (empId, updates) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId || "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.nome = updates.name;
        if (updates.permissions !== undefined) dbUpdates.permissoes = updates.permissions;
        if (updates.active !== undefined) dbUpdates.ativo = updates.active;
        if (updates.passwordHash !== undefined) dbUpdates.senha_hash = updates.passwordHash;

        await supabase.from('usuarios').update(dbUpdates).eq('id', empId).eq('workspace_id', workspaceId);

        set((s) => ({
          employees: s.employees.map((e) => (e.id === empId ? { ...e, ...updates } : e)),
        }));
      },

      resetEmployeePassword: async (empId, newPassword) => {
        const passwordHash = await hashPassword(newPassword)
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId || "0356ee6f-c655-4ae8-ad91-ff82703e07e9";
        
        // Atualiza a senha no banco de dados também!
        await supabase.from('usuarios').update({ senha_hash: passwordHash }).eq('id', empId).eq('workspace_id', workspaceId);

        set((s) => ({
          employees: s.employees.map((e) => (e.id === empId ? { ...e, passwordHash } : e)),
        }))
      },

      removeEmployee: async (empId) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId || "0356ee6f-c655-4ae8-ad91-ff82703e07e9";

        await supabase.from('usuarios').delete().eq('id', empId).eq('workspace_id', workspaceId);

        set((s) => ({
          employees: s.employees.filter((e) => e.id !== empId),
          currentUserId: s.currentUserId === empId ? null : s.currentUserId,
        }));
      },

      getCurrentUser: () => {
        const { admin, employees, currentUserId } = get()
        if (!currentUserId) return null
        if (currentUserId === "admin" && admin) {
          return {
            kind: "admin",
            id: "admin",
            name: admin.name,
            username: admin.username,
            permissions: fullPermissions(),
          }
        }
        const emp = employees.find((e) => e.id === currentUserId)
        if (!emp) return null
        return {
          kind: "employee",
          id: emp.id,
          name: emp.name,
          username: emp.username,
          permissions: emp.permissions,
        }
      },
    }),
    { name: "estoque-auth-v1" },
  ),
)