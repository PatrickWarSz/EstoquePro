# 🔒 Auditoria de Segurança - Stock Keeper Pro

**Data da Análise:** 15/05/2026  
**Status:** ⚠️ MÚLTIPLAS VULNERABILIDADES ENCONTRADAS  
**Prioridade de Correção:** IMEDIATA

---

## 📊 Sumário Executivo

| Severidade | Quantidade | Status |
|-----------|-----------|--------|
| 🔴 CRÍTICO | 6 | ⚠️ Requer ação imediata |
| 🟠 ALTO | 8 | ⚠️ Requer ação em curto prazo |
| 🟡 MÉDIO | 5 | ⚠️ Requer ação planejada |
| 🟢 BAIXO | 4 | ℹ️ Requer ação futura |
| **TOTAL** | **23** | |

---

## 🔴 VULNERABILIDADES CRÍTICAS (Requer ação imediata)

### 1. **CORS Aberto a Todas as Origens**

**Severidade:** 🔴 CRÍTICO  
**Localização:** 
- `supabase/functions/asaas-checkout/index.ts` (linhas 6-8)
- `supabase/functions/asaas-customer/index.ts` (linhas 6-8)
- `supabase/functions/asaas-upgrade-sub/index.ts` (linhas 6-8)
- `supabase/functions/asaas-cancel-sub/index.ts` (linhas 6-8)

**Problema:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // ❌ CRÍTICO: Aceita qualquer origem
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**Risco:** 
- Qualquer site pode fazer requisições para estas funções (CSRF)
- Ataque de clientes maliciosos conseguindo acessar/manipular dados de outros clientes
- Execução de operações de billing não autorizado

**Correção Recomendada:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://seu-dominio.com',  // ✅ Domínio específico
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '3600',
}
```

---

### 2. **Falta de Autorização em Funções de Billing (asaas-customer)**

**Severidade:** 🔴 CRÍTICO  
**Localização:** `supabase/functions/asaas-customer/index.ts` (linhas 14-67)

**Problema:**
A função aceita `workspaceId` do corpo da requisição SEM validar se o usuário autenticado é proprietário daquele workspace. Qualquer pessoa pode criar clientes Asaas para qualquer workspace.

```typescript
serve(async (req) => {
  // ❌ Nenhuma validação de autorização
  const { workspaceId, companyName, documentId, email, phone } = JSON.parse(bodyText)
  
  // A função usa o workspaceId do request sem verificar se pertence ao usuário autenticado
  await supabase.from('workspaces').update({
    asaas_customer_id: customerId,
    asaas_portal_url: portalUrl 
  }).eq('id', workspaceId)  // ❌ Qualquer workspaceId funciona
})
```

**Risco:**
- Qualquer usuário pode alterar os dados de billing de qualquer empresa
- Injeção de IDs de clientes Asaas maliciosos
- Acesso ao portal de outros clientes

**Correção Recomendada:**
```typescript
serve(async (req) => {
  // ✅ Verificar autorização no header
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const token = authHeader.slice(7)
  const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)
  
  // ✅ Validar token e obter usuário
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return new Response('Unauthorized', { status: 401 })

  const { workspaceId, ... } = JSON.parse(bodyText)
  
  // ✅ Verificar se o usuário pertence ao workspace
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from('usuarios')
    .select('workspace_id')
    .eq('id', user.id)
    .eq('workspace_id', workspaceId)
    .single()
  
  if (wsError || !workspace) {
    return new Response('Forbidden', { status: 403 })
  }
  
  // ✅ Agora pode proceder
})
```

---

### 3. **Falta de Autorização em asaas-checkout**

**Severidade:** 🔴 CRÍTICO  
**Localização:** `supabase/functions/asaas-checkout/index.ts` (linhas 14-64)

**Problema:** Mesma vulnerabilidade de `asaas-customer`. Qualquer usuário pode iniciar checkout para qualquer workspace.

```typescript
const { workspaceId, plan } = JSON.parse(bodyText)
// ❌ Sem verificação se o usuário é dono do workspace
```

**Risco:**
- Qualquer usuário pode forçar upgrades de plano em qualquer workspace
- Potencial fraude de cobrança

---

### 4. **Falta de Autorização em asaas-upgrade-sub**

**Severidade:** 🔴 CRÍTICO  
**Localização:** `supabase/functions/asaas-upgrade-sub/index.ts` (linhas 14-54)

**Problema:** Mesma vulnerabilidade. Qualquer pessoa pode fazer upgrade de plano de qualquer workspace.

---

### 5. **Falta de Autorização em asaas-cancel-sub**

**Severidade:** 🔴 CRÍTICO  
**Localização:** `supabase/functions/asaas-cancel-sub/index.ts` (linhas 14-42)

**Problema:** Qualquer pessoa pode cancelar a subscrição de qualquer empresa.

---

### 6. **Dados Sensíveis Expostos em Logs (console.log)**

**Severidade:** 🔴 CRÍTICO  
**Localização:**
- `supabase/functions/asaas-checkout/index.ts` linhas 15, 16, 20
- `supabase/functions/asaas-customer/index.ts` linha 39
- `supabase/functions/asaas-webhook/index.ts` linha 19
- `src/lib/auth-store.ts` linha 263 (console.error)

**Problema:**
```typescript
// asaas-checkout/index.ts
console.log("Body recebido:", bodyText)  // ❌ Expõe dados do request
console.log(`Processando checkout para Workspace: ${workspaceId}, Plano: ${plan}`)  // ❌ Expõe IDs
console.log("Resposta Asaas:", JSON.stringify(asaasData))  // ❌ Expõe dados de pagamento

// asaas-customer/index.ts
console.log("Resposta Asaas:", JSON.stringify(asaasData))  // ❌ Pode conter customer IDs
```

**Risco:**
- Logs de produção são acessíveis (possível vazamento)
- Expõe workspaceIds, customer IDs, dados de transações
- Possível rastreamento de padrões de uso
- Violação de LGPD/GDPR

**Correção Recomendada:**
```typescript
// ✅ Remover console.log em produção
if (Deno.env.get('ENVIRONMENT') === 'development') {
  console.log('Debug info')
}

// ✅ Usar apenas para erros críticos
console.error('Payment processing failed:', { status: asaasRes.status })
```

---

## 🟠 VULNERABILIDADES ALTAS

### 7. **Falta de Validação de Workspace em auth-store.ts**

**Severidade:** 🟠 ALTO  
**Localização:** `src/lib/auth-store.ts` linhas 207-208 (addEmployee)

**Problema:**
```typescript
addEmployee: async ({ username, password, name, permissions }) => {
  const { supabase } = await import('./supabase')
  const u = username.toLowerCase().trim()
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('cnpj_cpf')
    .eq('id', get().workspaceId)  // ✅ Usa workspaceId do store
    .single()
  
  // ❌ Mas não há verificação se o workspace realmente pertence ao usuário autenticado
  // Se o store for hackeado ou corrompido, qualquer workspace pode ser usado
```

**Risco:**
- Um usuário autenticado pode adicionar funcionários a outro workspace
- Se o estado Zustand for corrompido, permite acesso não autorizado

**Correção Recomendada:**
```typescript
addEmployee: async ({ username, password, name, permissions }) => {
  const { supabase } = await import('./supabase')
  const u = username.toLowerCase().trim()
  const currentWorkspaceId = get().workspaceId
  
  // ✅ Verificar que o workspace realmente pertence ao usuário
  const { data: user, error: userError } = await supabase
    .from('usuarios')
    .select('workspace_id')
    .eq('id', get().currentUserId)
    .single()
  
  if (!user || user.workspace_id !== currentWorkspaceId) {
    throw new Error('Unauthorized workspace access')
  }
  
  // Continuar...
}
```

---

### 8. **updateEmployee Não Verifica Autorização**

**Severidade:** 🟠 ALTO  
**Localização:** `src/lib/auth-store.ts` linhas 225-230

**Problema:**
```typescript
updateEmployee: async (id, updates) => {
  const { supabase } = await import('./supabase')
  // ❌ Não verifica se o funcionário (id) pertence ao workspace do usuário autenticado
  await supabase.from('usuarios').update(dbUpdates).eq('id', id)
}
```

**Risco:**
- Um admin de um workspace pode modificar funcionários de outro workspace
- Exploit de RLS se as policies estiverem mal configuradas

---

### 9. **removeEmployee Não Verifica Autorização**

**Severidade:** 🟠 ALTO  
**Localização:** `src/lib/auth-store.ts` linhas 233-236

**Problema:** Mesma vulnerabilidade de updateEmployee.

---

### 10. **Email Construído de Forma Insegura (addEmployee)**

**Severidade:** 🟠 ALTO  
**Localização:** `src/lib/auth-store.ts` linhas 205-208

**Problema:**
```typescript
const { data: workspace } = await supabase
  .from('workspaces')
  .select('cnpj_cpf')
  .eq('id', get().workspaceId)
  .single()
const virtualEmail = `${u}@${workspace?.cnpj_cpf || '00000000000000'}.vexo`
// ❌ Email construído com dados do banco de dados
// ❌ Se o CNPJ for modificado, o email fica inválido
// ❌ Não há validação se o CNPJ é válido
```

**Risco:**
- Email inválido não é detectado
- Possível conflito se múltiplos usuários têm mesmo CNPJ padrão
- Falta de auditoria do criação

**Correção Recomendada:**
```typescript
const virtualEmail = `${u}@${workspace?.cnpj_cpf || 'unknown'}.vexo`
if (!virtualEmail.includes('@')) {
  throw new Error('Invalid email construction')
}
```

---

### 11. **Falta de Sanitização do Campo Phone**

**Severidade:** 🟠 ALTO  
**Localização:** `supabase/functions/asaas-customer/index.ts` linha 45

**Problema:**
```typescript
const { workspaceId, companyName, documentId, email, phone } = JSON.parse(bodyText)

await fetch('https://api.asaas.com/v3/customers', {
  // ...
  body: JSON.stringify({
    name: companyName,
    cpfCnpj: documentId,
    email: email,
    mobilePhone: phone,  // ❌ Sem sanitização
    notificationDisabled: false
  })
})
```

**Risco:**
- Phone pode conter caracteres maliciosos
- Possível injection na API do Asaas
- Falta de validação de formato

**Correção Recomendada:**
```typescript
const phone = bodyText.match(/\d{10,11}/)?.[0] || ''
if (!phone) throw new Error('Invalid phone number')
```

---

### 12. **Falta de Validação de Input em setupAdmin**

**Severidade:** 🟠 ALTO  
**Localização:** `src/lib/auth-store.ts` linhas 59-80

**Problema:**
```typescript
setupAdmin: async ({ username, password, name, companyName, documentId, ownerCpf, phone }) => {
  const cleanDoc = documentId.replace(/\D/g, '')
  // ❌ Apenas remove caracteres não-numéricos
  // ❌ Não valida comprimento
  // ❌ Não valida checksum (embora LoginPage faça isso)
  // ❌ companyName não é validado
  // ❌ name não é validado
  // ❌ password é muito fraco (4 caracteres em LoginPage linha 121)
}
```

**Risco:**
- Dados inválidos salvos no banco
- Injeção de valores maliciosos
- Falha silenciosa de validação

---

### 13. **Webhook Asaas Sem Rate Limiting**

**Severidade:** 🟠 ALTO  
**Localização:** `supabase/functions/asaas-webhook/index.ts` linhas 1-55

**Problema:**
Não há rate limiting, throttling ou deduplicação de webhooks.

**Risco:**
- Um atacante pode enviar múltiplos webhooks idênticos
- Status de subscrição pode ser alterado múltiplas vezes
- DoS attack possível

**Correção Recomendada:**
```typescript
// ✅ Adicionar idempotency key
const idempotencyKey = body.event + payment.customer + payment.id
const { data: processed } = await supabase
  .from('webhook_log')
  .select('id')
  .eq('idempotency_key', idempotencyKey)
  .eq('status', 'processed')
  .single()

if (processed) {
  return new Response(JSON.stringify({ received: true }), { status: 200 })
}
```

---

### 14. **Console.error Expõe Stack Trace**

**Severidade:** 🟠 ALTO  
**Localização:** Múltiplos arquivos

**Problema:**
```typescript
console.error("Erro no Webhook:", error.message)  // ❌ Pode expor informações
```

**Risco:**
- Stack traces expostos em logs
- Informação de estrutura interna do sistema
- Ajuda attackers a encontrar vulnerabilidades

---

## 🟡 VULNERABILIDADES MÉDIAS

### 15. **Senha Muito Fraca (4 caracteres mínimo)**

**Severidade:** 🟡 MÉDIO  
**Localização:** `src/pages/LoginPage.tsx` linhas 118-121

**Problema:**
```typescript
if (password.length < 4) {
  toast.error("A senha deve ter pelo menos 4 caracteres")
  // ❌ 4 caracteres é muito fraco
}
```

**Risco:**
- Força brute attack trivial
- Não atende padrões de segurança
- Violação de boas práticas

**Correção Recomendada:**
```typescript
if (password.length < 12) {
  toast.error("A senha deve ter pelo menos 12 caracteres")
}

// ✅ Validar complexidade
const hasUpperCase = /[A-Z]/.test(password)
const hasLowerCase = /[a-z]/.test(password)
const hasNumbers = /\d/.test(password)
const hasSpecialChar = /[!@#$%^&*]/.test(password)

if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
  toast.error("Senha deve conter maiúscula, minúscula, número e caractere especial")
}
```

---

### 16. **Falta de Timeout nas Requisições**

**Severidade:** 🟡 MÉDIO  
**Localização:** Todas as funções Supabase

**Problema:**
```typescript
const asaasRes = await fetch('https://api.asaas.com/v3/customers', {
  // ❌ Sem timeout
})
```

**Risco:**
- Requisição pode ficar pendente indefinidamente
- DoS attack possível
- Consumo de recursos

**Correção Recomendada:**
```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 5000)

try {
  const asaasRes = await fetch('https://api.asaas.com/v3/customers', {
    signal: controller.signal,
    // ...
  })
} finally {
  clearTimeout(timeout)
}
```

---

### 17. **Falta de Validação de Resposta da API Asaas**

**Severidade:** 🟡 MÉDIO  
**Localização:** `supabase/functions/asaas-customer/index.ts` linhas 47-52

**Problema:**
```typescript
const asaasData = await asaasRes.json()
// ❌ Não valida se asaasData tem estrutura esperada
if (!asaasRes.ok) {
  throw new Error(asaasData.errors?.[0]?.description || 'Erro ao criar cliente no Asaas')
}
const customerId = asaasData.id  // ❌ Pode ser undefined
```

**Risco:**
- Se a API mudar, pode salvar dados inválidos
- customerId undefined salvo no banco
- Falha silenciosa

**Correção Recomendada:**
```typescript
if (!asaasData?.id || typeof asaasData.id !== 'string') {
  throw new Error('Invalid Asaas response: missing customer ID')
}
const customerId = asaasData.id
```

---

### 18. **Race Condition no Login**

**Severidade:** 🟡 MÉDIO  
**Localização:** `src/lib/auth-store.ts` linhas 134-170

**Problema:**
```typescript
login: async (username, password) => {
  const u = username.trim().toLowerCase()
  const { data: user, error: dbErr } = await supabase
    .from('usuarios')
    .select('*, workspaces(...)')  // Primeiro fetch
    .eq('username', u)
    .single()

  if (dbErr || !user) return { ok: false, error: "..." }

  let loginEmail = u
  if (user.tipo === 'funcionario') {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('cnpj_cpf')
      .eq('id', user.workspace_id)  // Segundo fetch - Race condition!
      .single()
  }

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: password
  })
}
```

**Risco:**
- Se o workspace for deletado entre os dois fetches, loginEmail fica inválido
- Múltiplas requisições simultâneas podem causar comportamento impredizível

**Correção Recomendada:**
```typescript
const { data: user, error: dbErr } = await supabase
  .from('usuarios')
  .select('*, workspaces(cnpj_cpf)')  // ✅ Join na mesma query
  .eq('username', u)
  .single()
```

---

### 19. **Falta de Validação de Body Vazio**

**Severidade:** 🟡 MÉDIO  
**Localização:** `supabase/functions/asaas-upgrade-sub/index.ts` linha 15

**Problema:**
```typescript
const { workspaceId, newPlan } = await req.json()
// ❌ Se body vazio, causa erro não tratado apropriadamente
```

**Risco:**
- Erro 500 em vez de 400
- Exposição de stack trace

**Correção Recomendada:**
```typescript
const bodyText = await req.text()
if (!bodyText) throw new Error("Empty request body")
const { workspaceId, newPlan } = JSON.parse(bodyText)
if (!workspaceId || !newPlan) throw new Error("Missing required fields")
```

---

## 🟢 VULNERABILIDADES BAIXAS

### 20. **Falta de Error Logging Estruturado**

**Severidade:** 🟢 BAIXO  
**Localização:** Todas as funções Supabase

**Problema:**
```typescript
console.error("Erro no Webhook:", error.message)
console.error("Erro Fatal:", error.message)
// ❌ Sem estrutura de logging
```

**Recomendação:**
```typescript
const logger = {
  error: (msg, context) => console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', msg, context })),
}
```

---

### 21. **Sem CSRF Protection no Frontend**

**Severidade:** 🟢 BAIXO  
**Localização:** `src/pages/LoginPage.tsx`, `src/components/settings/SubscriptionPanel.tsx`

**Problema:**
Não há CSRF tokens nas requisições de mutação.

**Nota:** Supabase Auth fornece proteção parcial, mas é recomendável adicionar tokens CSRF explícitos.

---

### 22. **Configuração VITE_SUPABASE_ANON_KEY Exposta**

**Severidade:** 🟢 BAIXO  
**Localização:** `src/lib/supabase.ts` linhas 3-5

**Problema:**
A chave anon do Supabase é exposta no frontend (o que é esperado para Supabase, mas requer RLS forte).

**Nota:** Isso é aceitável, mas depende fortemente de RLS policies corretas. Verificar que todas as tabelas têm RLS ativo.

---

### 23. **Falta de CSP Headers**

**Severidade:** 🟢 BAIXO  
**Localização:** Configuração do servidor

**Problema:**
Não há Content Security Policy headers.

**Recomendação:**
```typescript
// src/vite.config.ts
server: {
  headers: {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  }
}
```

---

## 📋 Checklist de Correção

### Imediato (Até 24 horas)
- [ ] Corrigir CORS em todas as funções Supabase
- [ ] Adicionar autorização a todas as funções de billing
- [ ] Remover console.log de dados sensíveis
- [ ] Adicionar verificação de workspace_id em updateEmployee e removeEmployee

### Curto Prazo (Até 1 semana)
- [ ] Implementar validação completa de inputs
- [ ] Adicionar rate limiting nos webhooks
- [ ] Aumentar requisito de senha mínima
- [ ] Adicionar timeout nas requisições HTTP
- [ ] Corrigir race condition no login

### Médio Prazo (Até 2 semanas)
- [ ] Implementar structured logging
- [ ] Adicionar CSP headers
- [ ] Adicionar CSRF tokens
- [ ] Auditar e validar todas as RLS policies

---

## 🔍 Verificações Recomendadas Adicionais

1. **Verificar RLS Policies** - Embora o documento mencione que RLS está ativo, é crítico auditar cada política
2. **Testar Autenticação** - Tentar acessar dados de outro workspace com token válido
3. **Verificar Service Role Key** - Confirmar que não está exposta em nenhum cliente
4. **Audit Log** - Implementar logging completo de ações sensíveis
5. **Penetration Testing** - Realizar testes de segurança profissionais

---

## 📞 Próximos Passos

1. Priorizar correção das vulnerabilidades CRÍTICAS
2. Criar tickets para cada vulnerabilidade
3. Implementar testes de segurança no CI/CD
4. Realizar nova auditoria após correções

