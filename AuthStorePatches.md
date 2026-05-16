# Patches auth-store.ts — Aplicar na ordem

## PATCH 1 — Interface Employee: adicionar isAdmin

Encontra:
```typescript
export interface Employee {
  id: string; username: string; passwordHash: string; name: string; permissions: Permissions; active: boolean; createdAt: string;
}
```

Troca por:
```typescript
export interface Employee {
  id: string; username: string; passwordHash: string; name: string; permissions: Permissions; active: boolean; isAdmin: boolean; createdAt: string;
}
```

---

## PATCH 2 — AuthState: adicionar isAdmin no addEmployee e removeEmployee real

Encontra:
```typescript
  addEmployee: (input: { username: string; password: string; name: string; permissions: any }) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateEmployee: (id: string, updates: Partial<Employee>) => void
  removeEmployee: (id: string) => void
```

Troca por:
```typescript
  addEmployee: (input: { username: string; password: string; name: string; permissions: any; isAdmin?: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateEmployee: (id: string, updates: Partial<Employee>) => void
  removeEmployee: (id: string) => Promise<void>
```

---

## PATCH 3 — addEmployee: salvar is_admin no banco

Encontra:
```typescript
        const { data, error } = await supabase.from('usuarios').insert([{ id: authData.user?.id, workspace_id: get().workspaceId, nome: name, username: u, tipo: 'funcionario', permissoes: permissions, ativo: true, senha_hash: 'migrated_to_auth' }]).select().single();
        if (error) return { ok: false, error: error.message };

        const newEmp: Employee = { id: data.id, username: data.username, passwordHash: 'migrated', name: data.nome, permissions: data.permissoes, active: data.ativo, createdAt: data.criado_em };
```

Troca por:
```typescript
        const { data, error } = await supabase.from('usuarios').insert([{ id: authData.user?.id, workspace_id: get().workspaceId, nome: name, username: u, tipo: 'funcionario', permissoes: permissions, is_admin: input.isAdmin || false, ativo: true, senha_hash: 'migrated_to_auth' }]).select().single();
        if (error) return { ok: false, error: error.message };

        const newEmp: Employee = { id: data.id, username: data.username, passwordHash: 'migrated', name: data.nome, permissions: data.permissoes, active: data.ativo, isAdmin: data.is_admin || false, createdAt: data.criado_em };
```

---

## PATCH 4 — removeEmployee: deleção real do Auth + soft delete

Encontra a função removeEmployee inteira:
```typescript
      removeEmployee: async (id) => {
        const { supabase } = await import('./supabase');
        const workspaceId = get().workspaceId;
        
        // SEGURANÇA: Validar que o funcionário pertence a este workspace antes de remover
        const { data: emp, error: checkErr } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .single();
        
        if (checkErr || !emp) {
          console.error('[removeEmployee] Tentativa de acesso não autorizado');
          return; // Silenciosamente falha - não vaza que o recurso não existe
        }
        
        await supabase
          .from('usuarios')
          .update({ ativo: false })
          .eq('id', id)
          .eq('workspace_id', workspaceId);
        
        set({ employees: get().employees.map(e => e.id === id ? { ...e, active: false } : e) });
      },
```

Troca por:
```typescript
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

        // 1. Soft delete no banco — preserva histórico de movimentações
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
```

---

## PATCH 5 — fetchEmployees: incluir isAdmin e excluir deletados

Encontra:
```typescript
      fetchEmployees: async () => {
        const { supabase } = await import('./supabase');
        if (!get().workspaceId) return;
        const { data } = await supabase.from('usuarios').select('*').eq('workspace_id', get().workspaceId).eq('tipo', 'funcionario');
        if (data) {
          const emps: Employee[] = data.map((e: any) => ({ id: e.id, username: e.username, passwordHash: 'migrated', name: e.nome, permissions: e.permissoes, active: e.ativo, createdAt: e.criado_em }));
          set({ employees: emps });
        }
      },
```

Troca por:
```typescript
      fetchEmployees: async () => {
        const { supabase } = await import('./supabase');
        if (!get().workspaceId) return;
        const { data } = await supabase
          .from('usuarios')
          .select('*')
          .eq('workspace_id', get().workspaceId)
          .eq('tipo', 'funcionario')
          .is('deleted_at', null); // Excluir funcionários removidos
        if (data) {
          const emps: Employee[] = data.map((e: any) => ({
            id: e.id,
            username: e.username,
            passwordHash: 'migrated',
            name: e.nome,
            permissions: e.permissoes,
            active: e.ativo,
            isAdmin: e.is_admin || false,
            createdAt: e.criado_em
          }));
          set({ employees: emps });
        }
      },
```

---

## PATCH 6 — updateEmployee: suportar is_admin

Encontra dentro de updateEmployee:
```typescript
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.nome = updates.name;
        if (updates.permissions) dbUpdates.permissoes = updates.permissions;
        if (updates.active !== undefined) dbUpdates.ativo = updates.active;
```

Troca por:
```typescript
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.nome = updates.name;
        if (updates.permissions) dbUpdates.permissoes = updates.permissions;
        if (updates.active !== undefined) dbUpdates.ativo = updates.active;
        if (updates.isAdmin !== undefined) dbUpdates.is_admin = updates.isAdmin;
```

---

## PATCH 7 — getCurrentUser: expor isAdmin

Encontra:
```typescript
    getCurrentUser: () => {
  const { admin, employees, currentUserId } = get();
  if (currentUserId === 'admin' && admin) return { kind: 'admin', id: 'admin', ...admin, permissions: fullPermissions() };
  if (currentUserId && currentUserId !== 'admin') {
    const emp = employees.find(e => e.id === currentUserId);
    return emp ? { kind: 'employee', ...emp } : null;
  }
  return null;
},
```

Troca por:
```typescript
    getCurrentUser: () => {
  const { admin, employees, currentUserId } = get();
  if (currentUserId === 'admin' && admin) return { kind: 'admin', id: 'admin', ...admin, permissions: fullPermissions(), isAdmin: true };
  if (currentUserId && currentUserId !== 'admin') {
    const emp = employees.find(e => e.id === currentUserId);
    return emp ? { kind: 'employee', ...emp } : null;
  }
  return null;
},
```

---

## PATCH 8 — CurrentUser type: adicionar isAdmin

Encontra:
```typescript
export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: Permissions }
  | { kind: "employee"; id: string; name: string; username: string; permissions: Permissions }
  | null
```

Troca por:
```typescript
export type CurrentUser =
  | { kind: "admin"; id: "admin"; name: string; username: string; permissions: Permissions; isAdmin: true }
  | { kind: "employee"; id: string; name: string; username: string; permissions: Permissions; isAdmin: boolean }
  | null
```