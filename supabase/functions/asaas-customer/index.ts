import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    if (!bodyText) throw new Error("Corpo da requisição vazio.")
    const { workspaceId, companyName, documentId, email, phone } = JSON.parse(bodyText)

    console.log(`Criando cliente Asaas para workspace: ${workspaceId}`)

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
    console.log("Resposta Asaas:", JSON.stringify(asaasData))

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

    return new Response(JSON.stringify({ success: true, customerId, portalUrl }), {
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