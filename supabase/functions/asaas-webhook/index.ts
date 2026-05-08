import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

serve(async (req) => {
  try {
    const body = await req.json()
    const event = body.event // Ex: PAYMENT_RECEIVED, PAYMENT_CONFIRMED
    const payment = body.payment // Dados do pagamento

    console.log(`Webhook recebido: Evento ${event} para o cliente ${payment.customer}`)

    // 1. Configura o Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl!, supabaseKey!)

    // 2. Filtramos apenas eventos de PAGAMENTO CONFIRMADO
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      
      // Buscamos qual empresa (workspace) tem esse ID de cliente do Asaas
      const { data: workspace, error: wErr } = await supabase
        .from('workspaces')
        .select('id, plano_atual')
        .eq('asaas_customer_id', payment.customer)
        .single()

      if (workspace) {
        // A MÁGICA: Ativamos a assinatura e renovamos a data de vencimento
        // O Asaas manda o campo 'dueDate'. Vamos colocar o vencimento para 32 dias após o pagamento (margem de segurança)
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 31);

        await supabase
          .from('workspaces')
          .update({ 
            status_assinatura: 'active',
            data_vencimento: nextDate.toISOString()
          })
          .eq('id', workspace.id)

        console.log(`Sucesso: Empresa ${workspace.id} ativada até ${nextDate.toLocaleDateString()}`)
      }
    }

    // 3. Respondemos 200 OK para o Asaas não ficar tentando reenviar
    return new Response(JSON.stringify({ received: true }), { 
      headers: { 'Content-Type': 'application/json' },
      status: 200 
    })

  } catch (error: any) {
    console.error("Erro no Webhook:", error.message)
    return new Response(error.message, { status: 400 })
  }
})