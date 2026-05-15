# 🛠️ Guia de Correção - Vulnerabilidades Críticas

## Step-by-Step Fix Guide

### 🔴 Prioridade 1: Corrigir CORS em Todas as Funções

**Arquivos afetados:**
- `supabase/functions/asaas-customer/index.ts`
- `supabase/functions/asaas-checkout/index.ts`
- `supabase/functions/asaas-upgrade-sub/index.ts`
- `supabase/functions/asaas-cancel-sub/index.ts`

**Passo 1:** Definir CORS headers seguros

```typescript
// ❌ ANTES
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ✅ DEPOIS
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://seu-app.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '3600',
  'Access-Control-Allow-Credentials': 'true',
}
```

**Ação:** Adicionar variável de ambiente `ALLOWED_ORIGIN` no Supabase console.

---

### 🔴 Prioridade 2: Adicionar Autenticação nas Funções de Billing

**Padrão a aplicar em todas as funções de billing:**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ✅ PASSO 1: Extrair e validar token
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const token = authHeader.slice(7)

    // ✅ PASSO 2: Criar cliente admin do Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

    // ✅ PASSO 3: Validar usuário do token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // ✅ PASSO 4: Validar que o usuário pertence ao workspace
    const bodyText = await req.text()
    if (!bodyText) throw new Error("Empty request body")
    
    const { workspaceId, ...rest } = JSON.parse(bodyText)
    if (!workspaceId) throw new Error("Missing workspaceId")

    // Verificar se o usuário é dono/admin do workspace
    const { data: workspace, error: wsError } = await supabase
      .from('usuarios')
      .select('workspace_id, tipo')
      .eq('id', user.id)
      .eq('workspace_id', workspaceId)
      .eq('tipo', 'admin')  // Apenas admins podem alterar billing
      .single()

    if (wsError || !workspace) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: User not admin of this workspace' }),
        { status: 403, headers: corsHeaders }
      )
    }

    // ✅ PASSO 5: Agora proceder com a operação de billing
    // ... resto da função segura

  } catch (error: any) {
    // ✅ Não expor detalhes internos
    const isDev = Deno.env.get('ENVIRONMENT') === 'development'
    return new Response(
      JSON.stringify({
        error: isDev ? error.message : 'Internal server error'
      }),
      { status: 400, headers: corsHeaders }
    )
  }
})
```

---

### 🔴 Prioridade 3: Remover console.log de Dados Sensíveis

**Padrão seguro:**

```typescript
// ❌ ANTES
console.log("Body recebido:", bodyText)
console.log(`Workspace: ${workspaceId}, Plano: ${plan}`)
console.log("Resposta Asaas:", JSON.stringify(asaasData))
console.error("Erro Asaas:", err)

// ✅ DEPOIS - Usar structured logging apenas para produção
const logEvent = (level, message, metadata = {}) => {
  const isDev = Deno.env.get('ENVIRONMENT') === 'development'
  
  if (level === 'error' || level === 'warn') {
    // ✅ Log errors sempre, sem dados sensíveis
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      // Não incluir: workspaceId, customerId, email, phone
      // Apenas IDs de rastreamento ou mensagens genéricas
      requestId: metadata.requestId
    }))
  }
}

// Uso:
logEvent('error', 'Asaas API error', { requestId: generateRequestId() })

// ✅ Para debugging, usar conditional
if (Deno.env.get('DEBUG') === 'true') {
  console.log('Debug info (dev only):', { workspaceId })
}
```

---

### 🟠 Prioridade 4: Validação de Workspace em CRUD

**Padrão para updateEmployee e removeEmployee:**

```typescript
// ❌ ANTES
updateEmployee: async (id, updates) => {
  const { supabase } = await import('./supabase')
  const dbUpdates: any = {}
  if (updates.name) dbUpdates.nome = updates.name
  if (updates.permissions) dbUpdates.permissoes = updates.permissions
  if (updates.active !== undefined) dbUpdates.ativo = updates.active
  await supabase.from('usuarios').update(dbUpdates).eq('id', id)
  set({ employees: get().employees.map(e => e.id === id ? { ...e, ...updates } : e) })
},

// ✅ DEPOIS
updateEmployee: async (id, updates) => {
  const { supabase } = await import('./supabase')
  const currentUserId = get().currentUserId
  const currentWorkspaceId = get().workspaceId

  // ✅ PASSO 1: Verificar que o usuário atual é admin
  const { data: currentUser } = await supabase
    .from('usuarios')
    .select('tipo, workspace_id')
    .eq('id', currentUserId)
    .single()

  if (currentUser?.tipo !== 'admin') {
    throw new Error('Only admins can update employees')
  }

  // ✅ PASSO 2: Verificar que o funcionário pertence ao workspace
  const { data: targetEmployee, error: empError } = await supabase
    .from('usuarios')
    .select('workspace_id')
    .eq('id', id)
    .eq('workspace_id', currentWorkspaceId)
    .single()

  if (empError || !targetEmployee) {
    throw new Error('Employee not found in this workspace')
  }

  // ✅ PASSO 3: Proceder com segurança
  const dbUpdates: any = {}
  if (updates.name) dbUpdates.nome = updates.name
  if (updates.permissions) dbUpdates.permissoes = updates.permissions
  if (updates.active !== undefined) dbUpdates.ativo = updates.active
  
  await supabase
    .from('usuarios')
    .update(dbUpdates)
    .eq('id', id)
    .eq('workspace_id', currentWorkspaceId)  // ✅ Double-check no DB

  set({ employees: get().employees.map(e => e.id === id ? { ...e, ...updates } : e) })
},
```

---

### 🟡 Prioridade 5: Aumentar Requisito de Senha

**Arquivo:** `src/pages/LoginPage.tsx`

```typescript
// ❌ ANTES
if (password.length < 4) {
  toast.error("A senha deve ter pelo menos 4 caracteres")
  setLoading(false)
  return
}

// ✅ DEPOIS
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 12) {
    return { valid: false, message: "Senha deve ter pelo menos 12 caracteres" }
  }

  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

  if (!hasUpperCase) {
    return { valid: false, message: "Senha deve conter letras maiúsculas" }
  }
  if (!hasLowerCase) {
    return { valid: false, message: "Senha deve conter letras minúsculas" }
  }
  if (!hasNumbers) {
    return { valid: false, message: "Senha deve conter números" }
  }
  if (!hasSpecialChar) {
    return { valid: false, message: "Senha deve conter caracteres especiais" }
  }

  return { valid: true }
}

// Uso:
const validation = validatePassword(password)
if (!validation.valid) {
  toast.error(validation.message)
  setLoading(false)
  return
}
```

---

### 🟡 Prioridade 6: Adicionar Timeout nas Requisições

**Aplicar em todos os `fetch`:**

```typescript
// ❌ ANTES
const asaasRes = await fetch('https://api.asaas.com/v3/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
  body: JSON.stringify(payload)
})

// ✅ DEPOIS
const fetchWithTimeout = async (url: string, options: any, timeoutMs: number = 5000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// Uso:
const asaasRes = await fetchWithTimeout(
  'https://api.asaas.com/v3/customers',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
    body: JSON.stringify(payload)
  },
  5000
)

if (!asaasRes.ok) {
  throw new Error(`Asaas API error: ${asaasRes.status}`)
}
```

---

### 🟡 Prioridade 7: Corrigir Race Condition no Login

**Arquivo:** `src/lib/auth-store.ts`

```typescript
// ❌ ANTES
login: async (username, password) => {
  const { supabase } = await import('./supabase')
  const u = username.trim().toLowerCase()

  const { data: user, error: dbErr } = await supabase
    .from('usuarios')
    .select('*, workspaces(status_assinatura, data_vencimento, asaas_portal_url)')
    .eq('username', u)
    .single()

  if (dbErr || !user) return { ok: false, error: "..." }
  if (!user.ativo) return { ok: false, error: "..." }

  let loginEmail = u
  if (user.tipo === 'funcionario') {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('cnpj_cpf')
      .eq('id', user.workspace_id)
      .single()  // ❌ Segunda query - Race condition!
    loginEmail = `${u}@${workspace?.cnpj_cpf || '00000000000000'}.vexo`
  }
  // ...
}

// ✅ DEPOIS - Usar join para evitar race condition
login: async (username, password) => {
  const { supabase } = await import('./supabase')
  const u = username.trim().toLowerCase()

  // ✅ Uma única query com join
  const { data: user, error: dbErr } = await supabase
    .from('usuarios')
    .select(
      `id, username, tipo, ativo, workspace_id,
       workspaces (
         id, status_assinatura, data_vencimento, asaas_portal_url, cnpj_cpf
       )`
    )
    .eq('username', u)
    .single()

  if (dbErr || !user) return { ok: false, error: "Usuário/E-mail ou senha incorretos." }
  if (!user.ativo) return { ok: false, error: "Seu acesso foi revogado." }

  // ✅ Dados já vinculados na mesma query
  const ws = user.workspaces as any
  let loginEmail = u
  
  if (user.tipo === 'funcionario') {
    if (!ws?.cnpj_cpf) {
      return { ok: false, error: "Erro ao processar workspace" }
    }
    loginEmail = `${u}@${ws.cnpj_cpf}.vexo`
  }

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: password,
  })

  if (authErr || !authData.user) {
    return { ok: false, error: "Usuário/E-mail ou senha incorretos." }
  }

  set({
    currentUserId: user.tipo === 'admin' ? 'admin' : user.id,
    workspaceId: user.workspace_id,
    subscriptionStatus: ws?.status_assinatura || 'trialing',
    expiryDate: ws?.data_vencimento || null,
    asaasPortalUrl: ws?.asaas_portal_url || null,
    admin: user.tipo === 'admin' ? { username: user.username, passwordHash: 'migrated', name: 'Admin' } : null,
  })

  return { ok: true }
}
```

---

## Checklist de Implementação

### Semana 1
- [ ] Implementar CORS correction em todas as funções
- [ ] Adicionar autenticação em asaas-customer
- [ ] Adicionar autenticação em asaas-checkout
- [ ] Adicionar autenticação em asaas-upgrade-sub
- [ ] Adicionar autenticação em asaas-cancel-sub
- [ ] Remover console.log sensíveis
- [ ] Testar CORS com curl

### Semana 2
- [ ] Adicionar validação em updateEmployee
- [ ] Adicionar validação em removeEmployee
- [ ] Aumentar requisito de senha
- [ ] Adicionar timeout nas requisições
- [ ] Corrigir race condition no login
- [ ] Adicionar testes de segurança

### Semana 3
- [ ] Audit de RLS policies
- [ ] Implementar structured logging
- [ ] Adicionar CSP headers
- [ ] Penetration testing
- [ ] Deploy de todas as correções

---

## Testing Commands

```bash
# 1. Testar CORS (deve ser rejeitado)
curl -i -X OPTIONS \
  -H "Origin: http://malicious.com" \
  -H "Access-Control-Request-Method: POST" \
  https://seu-supabase.com/functions/v1/asaas-customer

# 2. Testar autorização (usar workspaceId diferente)
curl -X POST \
  -H "Authorization: Bearer VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "DIFFERENT_WORKSPACE"}' \
  https://seu-supabase.com/functions/v1/asaas-customer

# 3. Testar sem token (deve ser rejeitado)
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "123"}' \
  https://seu-supabase.com/functions/v1/asaas-customer
```

