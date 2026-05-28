import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

// SEGURANÇA: CORS restrito aos domínios da VEXO
const ALLOWED_ORIGINS = [
  'https://auth.vexodev.com.br',
  'https://app.vexodev.com.br',
  'https://estoque.vexodev.com.br', // Agora sim, correto!
  'http://localhost:8080',
]

const getCorsHeaders = (origin: string | null) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// Função para validar token JWT do Supabase
async function verifySupabaseToken(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  try {
    const supabase = createClient(supabaseUrl!, supabaseKey!)
    const { data, error } = await supabase.auth.getUser(token)
    
    if (error || !data.user) return null
    return { userId: data.user.id }
  } catch {
    return null
  }
}

// Função para verificar se o usuário é admin do workspace
async function verifyWorkspaceAdmin(supabase: any, userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('tipo, workspace_id')
      .eq('id', userId)
      .eq('workspace_id', workspaceId)
      .single()
    
    return !error && data?.tipo === 'admin'
  } catch {
    return false
  }
}

// Função para fetch com timeout
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // SEGURANÇA: Validar autenticação
    const auth = await verifySupabaseToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: "Não autorizado. Faça login primeiro." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { workspaceId, newPlan } = await req.json()
    if (!workspaceId || newPlan !== 'annual') throw new Error("Requisição inválida.")

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl!, supabaseKey!)

    // SEGURANÇA: Verificar que o usuário é admin do workspace
    const isAdmin = await verifyWorkspaceAdmin(supabase, auth.userId, workspaceId)
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado. Apenas admins podem fazer upgrade." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // SEGURANÇA: Log sem dados sensíveis
    console.log(`[asaas-upgrade-sub] Upgrade iniciado | userId: ${auth.userId}`)

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')

    // 1. Pega os dados do cliente no banco
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('asaas_subscription_id, asaas_customer_id, plano_atual')
      .eq('id', workspaceId)
      .single()

    if (!workspace?.asaas_subscription_id) {
      throw new Error("Nenhuma assinatura ativa encontrada para upgrade.")
    }
    if (workspace.plano_atual === 'anual') {
      throw new Error("O cliente já está no plano Anual.")
    }

    // 2. Avisa o Asaas para alterar a assinatura existente (PUT)
    // O Asaas vai gerar a cobrança da diferença e manter o mesmo cartão/método de pagamento
    const asaasRes = await fetchWithTimeout(`https://api.asaas.com/api/v3/subscriptions/${workspace.asaas_subscription_id}`, {
      method: 'POST', // O Asaas usa POST mesmo para atualização em alguns endpoints, mas com o ID na URL
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey!
      },
      body: JSON.stringify({
        value: 1164.00, // Preço do Anual (12 x 97)
        cycle: "YEARLY",
        description: "Estoque PRO - Upgrade Plano Anual",
        updatePendingPayments: true // Atualiza os boletos/pix que ainda não foram pagos
      })
    })

    const asaasData = await asaasRes.json()
    if (!asaasRes.ok) throw new Error(asaasData.errors?.[0]?.description || "Erro no Asaas ao fazer upgrade")

    // 3. Atualiza no nosso banco de dados
    await supabase.from('workspaces').update({
      plano_atual: 'anual'
    }).eq('id', workspaceId)

    console.log(`[asaas-upgrade-sub] ✓ Upgrade realizado com sucesso`)

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error(`[asaas-upgrade-sub] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})