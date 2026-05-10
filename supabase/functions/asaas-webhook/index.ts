import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

serve(async (req) => {
  try {
    // A BLINDAGEM: Verifica se o aviso veio realmente do Asaas usando o Token de Segurança
    const asaasToken = req.headers.get('asaas-access-token')
    const mySecretToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

    if (!asaasToken || asaasToken !== mySecretToken) {
      console.error("Tentativa de fraude bloqueada: Token inválido.")
      return new Response("Unauthorized", { status: 401 })
    }

    const body = await req.json()
    const event = body.event
    const payment = body.payment

    console.log(`Webhook: ${event} | Cliente: ${payment.customer}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl!, supabaseKey!)

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, plano_atual')
      .eq('asaas_customer_id', payment.customer)
      .single()

    if (workspace) {
      // 1. PAGAMENTO CONFIRMADO
      if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
        const isAnnual = workspace.plano_atual === 'anual' || payment.description?.toLowerCase().includes('anual');
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + (isAnnual ? 370 : 32));

        await supabase.from('workspaces').update({ 
          status_assinatura: 'active',
          data_vencimento: nextDate.toISOString()
        }).eq('id', workspace.id)
      }
      // 2. PAGAMENTO ATRASADO
      else if (event === 'PAYMENT_OVERDUE') {
        await supabase.from('workspaces').update({ status_assinatura: 'past_due' }).eq('id', workspace.id)
      }
      // 3. ESTORNO/CHARGEBACK (Fraude)
      else if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
        await supabase.from('workspaces').update({ 
          status_assinatura: 'canceled',
          data_vencimento: new Date().toISOString()
        }).eq('id', workspace.id)
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (error: any) {
    console.error("Erro no Webhook:", error.message)
    return new Response(error.message, { status: 400 })
  }
})