import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  'https://app.vexodev.com.br',
  'https://app.vexo.com.br',
  'http://localhost:8080',
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

async function verifySupabaseToken(req: Request): Promise<{ userId: string; workspaceId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  // Busca workspace do usuário autenticado
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('workspace_id, tipo, is_admin')
    .eq('id', data.user.id)
    .single()

  // Apenas admin ou is_admin pode chamar essa função
  if (!usuario || (usuario.tipo !== 'admin' && !usuario.is_admin)) return null

  return { userId: data.user.id, workspaceId: usuario.workspace_id }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Autenticação obrigatória
    const auth = await verifySupabaseToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { userId: targetUserId } = await req.json()
    if (!targetUserId) throw new Error('userId ausente')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // SEGURANÇA: Confirmar que o target pertence ao mesmo workspace do solicitante
    const { data: targetUser, error: checkErr } = await supabase
      .from('usuarios')
      .select('workspace_id, tipo')
      .eq('id', targetUserId)
      .single()

    if (checkErr || !targetUser) throw new Error('Funcionário não encontrado')
    if (targetUser.workspace_id !== auth.workspaceId) throw new Error('Acesso negado: workspace diferente')
    if (targetUser.tipo === 'admin') throw new Error('Não é permitido remover o administrador principal')

    // Remove do Supabase Auth
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetUserId)
    if (deleteErr) throw new Error(`Erro ao remover do Auth: ${deleteErr.message}`)

    console.log(`[delete-auth-user] ✓ Usuário removido do Auth | workspace: ${auth.workspaceId}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`[delete-auth-user] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})