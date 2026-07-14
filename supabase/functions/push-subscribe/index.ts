import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors"

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })

serve(async (req) => {
  const headers = responseHeaders
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers })

  try {
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

    if (action === "subscribe") {
      const { deviceId, deviceLabel, subscription } = body
      if (!deviceId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: "invalid subscription" }, 400, headers)
      }
      const row = {
        workspace_id: usuario.workspace_id,
        user_id: usuario.id,
        device_id: deviceId,
        device_label: deviceLabel || "Dispositivo",
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }
      // Upsert por (user_id, device_id)
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(row, { onConflict: "user_id,device_id" })
      if (error) throw error
      return json({ ok: true }, 200, headers)
    }

    if (action === "unsubscribe") {
      const { deviceId } = body
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", usuario.id)
        .eq("device_id", deviceId)
      return json({ ok: true }, 200, headers)
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, device_id, device_label, created_at")
        .eq("user_id", usuario.id)
        .order("created_at", { ascending: false })
      if (error) throw error
      return json({ data: data || [] }, 200, headers)
    }

    if (action === "remove") {
      const { id } = body
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("id", id)
        .eq("user_id", usuario.id)
      return json({ ok: true }, 200, headers)
    }

    return json({ error: "invalid action" }, 400, headers)
  } catch (error: any) {
    console.error("[push-subscribe]", error)
    return json({ error: error?.message || "internal" }, 400, headers)
  }
})