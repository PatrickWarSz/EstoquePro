import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

// SEGURANÇA: CORS restrito ao domínio da VEXO
const ALLOWED_ORIGINS = [
  'https://app.vexo.com.br',
  'https://www.vexo.com.br',
  'http://localhost:8080', // desenvolvimento local
]

const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin || '') ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

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

    const bodyText = await req.text()
    const { workspaceId } = JSON.parse(bodyText)
    if (!workspaceId) throw new Error("Workspace ID ausente.")

    // SEGURANÇA: Log sem dados sensíveis
    console.log(`[asaas-cancel-sub] Cancelamento iniciado | userId: ${auth.userId}`)

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const supabase = createClient(supabaseUrl!, supabaseKey!)

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('asaas_subscription_id')
      .eq('id', workspaceId)
      .single()

    if (!workspace?.asaas_subscription_id) {
      throw new Error("Nenhuma assinatura ativa encontrada para este cliente.")
    }

    const asaasRes = await fetch(`https://api.asaas.com/v3/subscriptions/${workspace.asaas_subscription_id}`, {
      method: 'DELETE',
      headers: { 'access_token': asaasApiKey! }
    })

    if (!asaasRes.ok) {
      const asaasData = await asaasRes.json()
      throw new Error(asaasData.errors?.[0]?.description || "Erro ao cancelar no Asaas")
    }

    await supabase.from('workspaces').update({
      status_assinatura: 'canceled'
    }).eq('id', workspaceId)

    console.log(`[asaas-cancel-sub] ✓ Cancelamento realizado com sucesso`)

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error(`[asaas-cancel-sub] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})