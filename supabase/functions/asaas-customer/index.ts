import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Ignora a requisição de pré-checagem (CORS) do navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Recebe os dados do Frontend
   const { workspaceId, companyName, documentId, email, phone } = await req.json()

    // 2. Pega as chaves secretas do Cofre do Supabase
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!asaasApiKey) throw new Error("Chave do Asaas não configurada no servidor.")

    // 3. Bate na API do Asaas (Criar Cliente)
    const asaasRes = await fetch('https://api.asaas.com/api/v3/customers', {
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

    if (!asaasRes.ok) {
      console.error("Erro Asaas:", asaasData)
      throw new Error(asaasData.errors?.[0]?.description || 'Erro ao criar cliente no Asaas')
    }

    const customerId = asaasData.id // Ex: cus_000001234
    
    // Pega o link seguro que o Asaas gera automaticamente para cada cliente gerenciar a própria vida
    const portalUrl = asaasData.invoiceUrl || `https://sandbox.asaas.com/c/${customerId}`;

    // 4. Salva o ID e a URL do Portal no nosso banco de dados (Workspaces)
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)
    const { error: dbErr } = await supabase
      .from('workspaces')
      .update({ 
        asaas_customer_id: customerId,
        asaas_portal_url: portalUrl 
      })
      .eq('id', workspaceId)

    if (dbErr) throw dbErr

    // 5. Devolve o sucesso para a tela
    return new Response(JSON.stringify({ success: true, customerId, portalUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})