import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  'https://auth.vexodev.com.br',
  'https://app.vexodev.com.br',
  'https://estoque.vexodev.com.br',
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

async function verifyAdmin(req: Request): Promise<{ workspaceId: string } | null> {
  const token = req.headers.get('authorization')?.slice(7)
  if (!token) return null

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

  if (!usuario || (usuario.tipo !== 'admin' && !usuario.is_admin)) return null
  return { workspaceId: usuario.workspace_id }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = await verifyAdmin(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { employeeId } = await req.json()
    if (!employeeId) throw new Error('employeeId obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // SEGURANÇA: Confirmar que o alvo pertence ao mesmo workspace do admin
    const { data: target, error: checkErr } = await supabase
      .from('usuarios')
      .select('workspace_id, tipo')
      .eq('id', employeeId)
      .single()

    if (checkErr || !target) throw new Error('Funcionário não encontrado')
    if (target.workspace_id !== auth.workspaceId) throw new Error('Acesso negado: workspace diferente')
    if (target.tipo === 'admin') throw new Error('Não é permitido revogar a sessão do administrador principal')

    // Revogar TODAS as sessões ativas do funcionário imediatamente
    const { error: signOutErr } = await supabase.auth.admin.signOut(employeeId, 'global')

    if (signOutErr) throw new Error(`Erro ao revogar sessão: ${signOutErr.message}`)

    console.log(`[revoke-employee-session] ✓ Sessão revogada | workspace: ${auth.workspaceId} | employee: ${employeeId}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`[revoke-employee-session] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})