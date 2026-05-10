import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { workspaceId } = await req.json()
    if (!workspaceId) throw new Error("Workspace ID ausente.")

    const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const supabase = createClient(supabaseUrl!, supabaseKey!)

    // 1. Busca o ID da assinatura no banco
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('asaas_subscription_id')
      .eq('id', workspaceId)
      .single()

    if (!workspace?.asaas_subscription_id) {
      throw new Error("Nenhuma assinatura ativa encontrada para este cliente.")
    }

    // 2. Manda a ordem de exclusão para o Asaas
    const asaasRes = await fetch(`https://sandbox.asaas.com/api/v3/subscriptions/${workspace.asaas_subscription_id}`, {
      method: 'DELETE',
      headers: { 'access_token': asaasApiKey! }
    })

    const asaasData = await asaasRes.json()
    if (!asaasRes.ok) throw new Error(asaasData.errors?.[0]?.description || "Erro ao cancelar no Asaas")

    // 3. Atualiza nosso banco de dados
    await supabase.from('workspaces').update({
      status_assinatura: 'canceled'
    }).eq('id', workspaceId)

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})