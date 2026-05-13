import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Lida com a requisição de pré-vôo (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Valida se existe um corpo na requisição antes de tentar ler
   const bodyText = await req.text();
console.log("Body recebido:", bodyText);
if (!bodyText) {
  throw new Error("Corpo da requisição vazio.");
}
const { workspaceId, plan } = JSON.parse(bodyText);
    console.log(`Processando checkout para Workspace: ${workspaceId}, Plano: ${plan}`);

    // 3. Pega as chaves
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!asaasApiKey || !supabaseUrl || !supabaseKey) {
      throw new Error("Configurações do servidor (Secrets) incompletas.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 4. Busca o cliente no banco
    const { data: workspace, error: wErr } = await supabase
      .from('workspaces')
      .select('asaas_customer_id')
      .eq('id', workspaceId)
      .single()

    if (wErr || !workspace?.asaas_customer_id) {
      throw new Error("Empresa não encontrada ou sem ID do Asaas.");
    }

    // 5. Configura valores
    const isAnnual = plan === 'annual'
    const value = isAnnual ? 1164.00 : 147.00
    const cycle = isAnnual ? "YEARLY" : "MONTHLY"
    const description = `Estoque PRO - Plano ${isAnnual ? 'Anual' : 'Mensal'}`
    const today = new Date().toISOString().split('T')[0]

    // 6. Chamada ao Asaas (Sandbox)
    const subRes = await fetch('https://api.asaas.com/v3/subscriptions', {
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
    if (!subRes.ok) throw new Error(subData.errors?.[0]?.description || "Erro no Asaas.");

    // 7. Salva a assinatura e busca o link
    await supabase.from('workspaces').update({ asaas_subscription_id: subData.id }).eq('id', workspaceId)

   const payRes = await fetch(`https://api.asaas.com/v3/payments?subscription=${subData.id}`, {
  headers: { 'access_token': asaasApiKey }
})
    const payData = await payRes.json()
    const invoiceUrl = payData.data[0]?.invoiceUrl

    return new Response(JSON.stringify({ invoiceUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Erro Fatal:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})