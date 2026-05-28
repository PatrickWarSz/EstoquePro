import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  'https://auth.vexodev.com.br',
  'https://app.vexodev.com.br',
  'https:estoque.vexodev.com.br',
  'http://localhost:8080', // desenvolvimento local
]

const getCorsHeaders = (origin: string | null) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

async function verifyAdminToken(req: Request): Promise<{ userId: string; workspaceId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('workspace_id, tipo, is_admin')
    .eq('id', data.user.id)
    .single()

  // Somente admin ou is_admin pode criar funcionários
  if (!usuario || (usuario.tipo !== 'admin' && !usuario.is_admin)) return null

  return { userId: data.user.id, workspaceId: usuario.workspace_id }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Validar que o solicitante é admin do workspace
    const auth = await verifyAdminToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { username, password, name, permissions, isAdmin, workspaceId } = await req.json()

    // 2. Validar que o workspaceId do body bate com o do token (defense-in-depth)
    if (!workspaceId || workspaceId !== auth.workspaceId) {
      return new Response(JSON.stringify({ error: 'Workspace inválido' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!username || !password || !name) {
      throw new Error('Campos obrigatórios ausentes: username, password, name')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3. Buscar cnpj_cpf do workspace para montar o e-mail fantasma
    const { data: workspace, error: wsErr } = await supabase
      .from('workspaces')
      .select('cnpj_cpf')
      .eq('id', workspaceId)
      .single()

    if (wsErr || !workspace?.cnpj_cpf) {
      throw new Error('Workspace não encontrado ou sem CNPJ cadastrado')
    }

    const u = username.toLowerCase().trim()
    const virtualEmail = `${u}@${workspace.cnpj_cpf}.vexo`

    // 4. Verificar se username já existe neste workspace (evitar duplicata silenciosa)
    const { data: existing } = await supabase
      .from('usuarios')
      .select('id')
      .eq('username', u)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (existing) {
      throw new Error('Nome de usuário já está em uso neste workspace')
    }

    // 5. Criar no Supabase Auth com service_role (sem expor tempClient no frontend)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: virtualEmail,
      password,
      email_confirm: true, // funcionários não precisam confirmar e-mail
    })

    if (authErr || !authData.user) {
      throw new Error(authErr?.message || 'Erro ao criar usuário no Auth')
    }

    // 6. Inserir na tabela usuarios vinculado ao workspace
    const { data: newUser, error: dbErr } = await supabase
      .from('usuarios')
      .insert([{
        id: authData.user.id,
        workspace_id: workspaceId,
        nome: name,
        username: u,
        tipo: 'funcionario',
        permissoes: permissions,
        is_admin: isAdmin || false,
        ativo: true,
        senha_hash: 'migrated_to_auth',
      }])
      .select()
      .single()

    if (dbErr) {
      // Rollback: se o insert no banco falhou, remover do Auth para não deixar órfão
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Erro ao salvar funcionário: ${dbErr.message}`)
    }

    console.log(`[create-employee-auth] ✓ Funcionário criado | workspace: ${workspaceId} | user: ${u}`)

    return new Response(JSON.stringify({ success: true, id: newUser.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`[create-employee-auth] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})