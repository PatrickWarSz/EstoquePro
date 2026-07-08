import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  "https://auth.vexodev.com.br",
  "https://app.vexodev.com.br",
  "https://estoque.vexodev.com.br",
  "http://localhost:8080",
]

const cors = (origin: string | null) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })

async function getAuth(req: Request, supabase: any) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, workspace_id, tipo, is_admin, ativo")
    .eq("id", data.user.id)
    .single()
  if (!usuario?.ativo) return null
  return {
    userId: data.user.id,
    workspaceId: usuario.workspace_id,
    isAdmin: usuario.tipo === "admin" || usuario.is_admin === true,
  }
}

serve(async (req) => {
  const headers = cors(req.headers.get("origin"))
  if (req.method === "OPTIONS") return new Response("ok", { headers })

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const auth = await getAuth(req, supabase)
    if (!auth) return json({ error: "Não autorizado" }, 401, headers)

    const { action, payload = {} } = await req.json()
    const workspaceId = auth.workspaceId

    if (action === "workspace_info") {
      const { data, error } = await supabase
        .from("workspaces")
        .select("nome_empresa, cnpj_cpf, slug, status_assinatura, data_vencimento, asaas_portal_url, plano_atual")
        .eq("id", workspaceId)
        .single()
      if (error) throw error
      return json({ data }, 200, headers)
    }

    if (action === "employees") {
      if (!auth.isAdmin) return json({ error: "Acesso negado" }, 403, headers)
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("tipo", "funcionario")
        .is("deleted_at", null)
        .order("criado_em", { ascending: false })
      if (error) throw error
      return json({ data: data || [] }, 200, headers)
    }

    if (action === "somatorios_list") {
      const { data, error } = await supabase
        .from("somatorios")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
      if (error) throw error
      return json({ data: data || [] }, 200, headers)
    }

    if (action === "somatorio_add") {
      const { data, error } = await supabase
        .from("somatorios")
        .insert({ ...payload, workspace_id: workspaceId })
        .select()
        .single()
      if (error) throw error
      return json({ data }, 200, headers)
    }

    if (action === "somatorio_update") {
      const { id, updates } = payload
      const { data, error } = await supabase
        .from("somatorios")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .single()
      if (error) throw error
      return json({ data }, 200, headers)
    }

    if (action === "somatorio_delete") {
      const { error } = await supabase.from("somatorios").delete().eq("id", payload.id).eq("workspace_id", workspaceId)
      if (error) throw error
      return json({ ok: true }, 200, headers)
    }

    if (action === "backups_list") {
      if (!auth.isAdmin) return json({ error: "Acesso negado" }, 403, headers)
      const { data, error } = await supabase
        .from("backup_logs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "ok")
        .order("criado_em", { ascending: false })
        .limit(7)
      if (error) throw error
      return json({ data: data || [] }, 200, headers)
    }

    if (action === "backup_create") {
      if (!auth.isAdmin) return json({ error: "Acesso negado" }, 403, headers)
      const tables = ["usuarios", "produtos", "categorias", "movimentacoes", "locais_estoque", "pedidos", "fornecedores", "entregas_pedido", "aliases_qr"]
      const results = await Promise.all(tables.map((t) => supabase.from(t).select("*").eq("workspace_id", workspaceId)))
      const dataByTable: Record<string, unknown[]> = {}
      tables.forEach((t, i) => { dataByTable[t] = results[i].data || [] })
      const id = `backup-${Date.now()}`
      const timestamp = new Date().toISOString()
      const backup = {
        _meta: { version: "2.1", app: "EstoquePro", workspace_id: workspaceId, timestamp },
        ...dataByTable,
      }
      const body = JSON.stringify(backup)
      const storagePath = `${workspaceId}/${id}.json`
      const { error: upErr } = await supabase.storage.from("backups").upload(storagePath, body, { contentType: "application/json", upsert: true })
      if (upErr) throw upErr
      const { error: logErr } = await supabase.from("backup_logs").insert([{ id, workspace_id: workspaceId, storage_path: storagePath, tamanho_bytes: body.length, status: "ok", criado_em: timestamp }])
      if (logErr) throw logErr
      await supabase.rpc("cleanup_old_backups", { p_workspace_id: workspaceId })
      return json({ ok: true, id }, 200, headers)
    }

    return json({ error: "Ação inválida" }, 400, headers)
  } catch (error: any) {
    return json({ error: error?.message || "Erro interno" }, 400, headers)
  }
})