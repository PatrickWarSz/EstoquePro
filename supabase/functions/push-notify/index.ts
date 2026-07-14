import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors"
import webpush from "npm:web-push@3.6.7"

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || ""
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || ""
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@vexodev.com.br"

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE) } catch (e) { console.error("[vapid]", e) }
}

async function sendToWorkspace(supabase: any, workspaceId: string, payload: any) {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("workspace_id", workspaceId)
  if (error) throw error
  if (!subs?.length) return { sent: 0, removed: 0 }

  let sent = 0, removed = 0
  const bodyStr = JSON.stringify(payload)
  const toRemove: string[] = []

  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        bodyStr,
      )
      sent++
    } catch (err: any) {
      const status = err?.statusCode
      if (status === 404 || status === 410) toRemove.push(s.id)
      else console.warn("[push-notify] send failed", status, err?.body)
    }
  }))

  if (toRemove.length) {
    await supabase.from("push_subscriptions").delete().in("id", toRemove)
    removed = toRemove.length
  }
  return { sent, removed }
}

serve(async (req) => {
  const headers = responseHeaders
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers })

  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ error: "VAPID keys not configured" }, 500, headers)
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "no token" }, 401, headers)
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401, headers)

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("id, workspace_id, ativo")
      .eq("id", userData.user.id)
      .single()
    if (!usuario?.ativo || !usuario.workspace_id) return json({ error: "no workspace" }, 403, headers)

    const body = await req.json()
    const action = body.action as string
    const workspaceId = usuario.workspace_id

    if (action === "stock_check") {
      const { itemId, prevQty, newQty } = body
      if (!itemId) return json({ error: "itemId required" }, 400, headers)

      const { data: produto, error: prodErr } = await supabase
        .from("produtos")
        .select("id, nome, quantidade, estoque_minimo, unidade, workspace_id, categoria_id")
        .eq("id", itemId)
        .eq("workspace_id", workspaceId)
        .maybeSingle()
      if (prodErr || !produto) return json({ error: "produto not found" }, 404, headers)

      const min = Number(produto.estoque_minimo) || 0
      // Usa a quantidade atual do banco (verdade absoluta) para decidir
      const currentQty = Number(produto.quantidade) || 0
      const prev = typeof prevQty === "number" ? Number(prevQty) : currentQty
      const curr = typeof newQty === "number" ? Number(newQty) : currentQty

      const prevState = prev === 0 ? "zero" : prev <= min ? "low" : "ok"
      const currState = curr === 0 ? "zero" : curr <= min ? "low" : "ok"

      // Recupera o estado do último alerta enviado (dedupe)
      const { data: alertState } = await supabase
        .from("stock_alert_state")
        .select("last_state")
        .eq("workspace_id", workspaceId)
        .eq("produto_id", itemId)
        .maybeSingle()
      const lastSent = (alertState?.last_state as string | undefined) || "ok"

      // Só notifica quando entra num estado pior do que o último enviado
      let notify = false
      if (currState === "zero" && lastSent !== "zero") notify = true
      else if (currState === "low" && lastSent === "ok") notify = true

      // Reset quando volta ao ok
      if (currState === "ok" && lastSent !== "ok") {
        await supabase
          .from("stock_alert_state")
          .upsert(
            { workspace_id: workspaceId, produto_id: itemId, last_state: "ok", updated_at: new Date().toISOString() },
            { onConflict: "workspace_id,produto_id" },
          )
      }

      if (!notify) return json({ ok: true, notified: false, currState, lastSent }, 200, headers)

      const unidade = produto.unidade || "un"
      const title = currState === "zero"
        ? `Estoque zerado: ${produto.nome}`
        : `Estoque baixo: ${produto.nome}`
      const bodyText = currState === "zero"
        ? `O item "${produto.nome}" acabou. Reponha o quanto antes.`
        : `Restam ${curr} ${unidade} (mínimo ${min}) — hora de repor.`

      const payload = {
        title,
        body: bodyText,
        tag: `stock-${itemId}`,
        url: `/app/estoque`,
        data: { itemId, workspaceId, state: currState },
      }

      const result = await sendToWorkspace(supabase, workspaceId, payload)

      await supabase
        .from("stock_alert_state")
        .upsert(
          { workspace_id: workspaceId, produto_id: itemId, last_state: currState, updated_at: new Date().toISOString() },
          { onConflict: "workspace_id,produto_id" },
        )

      return json({ ok: true, notified: true, currState, ...result }, 200, headers)
    }

    if (action === "test") {
      const result = await sendToWorkspace(supabase, workspaceId, {
        title: "Notificação de teste",
        body: "Se você recebeu isso, os alertas estão funcionando!",
        tag: "test",
        url: "/app/configuracoes",
      })
      return json({ ok: true, ...result }, 200, headers)
    }

    return json({ error: "invalid action" }, 400, headers)
  } catch (error: any) {
    console.error("[push-notify]", error)
    return json({ error: error?.message || "internal" }, 500, headers)
  }
})