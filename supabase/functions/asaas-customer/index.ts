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

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

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

    const bodyText = await req.text()
    if (!bodyText) throw new Error("Corpo da requisição vazio.")
    const { workspaceId, companyName, documentId, email, phone } = JSON.parse(bodyText)

    if (!workspaceId || !companyName || !documentId) {
      throw new Error("Parâmetros obrigatórios faltando.")
    }

    // SEGURANÇA: Log sem dados sensíveis (apenas IDs)
    console.log(`[asaas-customer] Criando cliente | userId: ${auth.userId}`)

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!asaasApiKey) throw new Error("Chave do Asaas não configurada.")

    const asaasRes = await fetch('https://api.asaas.com/v3/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey
      },
      body: JSON.stringify({
        name: companyName,
        cpfCnpj: documentId,
        email: email,
        mobilePhone: phone,
        notificationDisabled: false
      })
    })

    const asaasData = await asaasRes.json()
    // SEGURANÇA: Log sem expor resposta sensível
    if (!asaasRes.ok) console.error(`[asaas-customer] Erro na API Asaas | Status: ${asaasRes.status}`)

    if (!asaasRes.ok) {
      throw new Error(asaasData.errors?.[0]?.description || 'Erro ao criar cliente no Asaas')
    }

    const customerId = asaasData.id
    const portalUrl = `https://www.asaas.com/c/${customerId}`

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)
    const { error: dbErr } = await supabase
      .from('workspaces')
      .update({ 
        asaas_customer_id: customerId,
        asaas_portal_url: portalUrl 
      })
      .eq('id', workspaceId)

    if (dbErr) throw dbErr

    console.log(`[asaas-customer] ✓ Cliente criado com sucesso`)

    return new Response(JSON.stringify({ success: true, customerId, portalUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error(`[asaas-customer] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})