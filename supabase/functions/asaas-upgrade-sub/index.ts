import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { workspaceId, newPlan } = await req.json()
    if (!workspaceId || newPlan !== 'annual') throw new Error("Requisição inválida.")

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const supabase = createClient(supabaseUrl!, supabaseKey!)

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
    const asaasRes = await fetch(`https://api.asaas.com/api/v3/subscriptions/${workspace.asaas_subscription_id}`, {
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

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})