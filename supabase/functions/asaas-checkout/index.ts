import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

// SEGURANÇA: CORS restrito aos domínios da VEXO
const ALLOWED_ORIGINS = [
  'https://app.vexo.com.br',
  'https://www.vexo.com.br',
  'https://app.vexodev.com.br',
  'https://vexo.com.br',
  'http://localhost:8080', // desenvolvimento local
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

  // 1. Lida com a requisição de pré-vôo (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SEGURANÇA: Validar autenticação
    const auth = await verifySupabaseToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: "Não autorizado. Faça login primeiro." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 2. Valida se existe um corpo na requisição antes de tentar ler
    const bodyText = await req.text()
    if (!bodyText) {
      throw new Error("Corpo da requisição vazio.")
    }
    const { workspaceId, plan } = JSON.parse(bodyText)

    if (!workspaceId || !plan) {
      throw new Error("Parâmetros obrigatórios faltando.")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // SEGURANÇA: Verificar que o usuário é admin do workspace
    const isAdmin = await verifyWorkspaceAdmin(supabase, auth.userId, workspaceId)
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado. Apenas admins podem criar faturas." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // SEGURANÇA: Log sem dados sensíveis
    console.log(`[asaas-checkout] Checkout iniciado | userId: ${auth.userId}`)

    // 3. Pega as chaves
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')

    if (!asaasApiKey) {
      throw new Error("Configurações do servidor (Secrets) incompletas.")
    }

    // 4. Busca o cliente no banco
    const { data: workspace, error: wErr } = await supabase
      .from('workspaces')
      .select('asaas_customer_id')
      .eq('id', workspaceId)
      .single()

    if (wErr || !workspace?.asaas_customer_id) {
      throw new Error("Empresa não encontrada ou sem ID do Asaas.")
    }

    // 5. Configura valores
    const isAnnual = plan === 'annual'
    const value = isAnnual ? 1164.00 : 147.00
    const cycle = isAnnual ? "YEARLY" : "MONTHLY"
    const description = `Estoque PRO - Plano ${isAnnual ? 'Anual' : 'Mensal'}`
    const today = new Date().toISOString().split('T')[0]

    // 6. Chamada ao Asaas (Sandbox)
    const subRes = await fetchWithTimeout('https://api.asaas.com/v3/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey
      },
      body: JSON.stringify({
        customer: workspace.asaas_customer_id,
        billingType: "UNDEFINED",
        nextDueDate: today,
        value: value,
        cycle: cycle,
        description: description
      })
    })

    const subData = await subRes.json()
    if (!subRes.ok) throw new Error(subData.errors?.[0]?.description || "Erro no Asaas.")

    // 7. Salva a assinatura e busca o link
    await supabase.from('workspaces').update({ asaas_subscription_id: subData.id }).eq('id', workspaceId)

    const payRes = await fetchWithTimeout(`https://api.asaas.com/v3/payments?subscription=${subData.id}`, {
      headers: { 'access_token': asaasApiKey }
    })
    const payData = await payRes.json()
    const invoiceUrl = payData.data[0]?.invoiceUrl

    console.log(`[asaas-checkout] ✓ Checkout criado com sucesso`)

    return new Response(JSON.stringify({ invoiceUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error(`[asaas-checkout] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})