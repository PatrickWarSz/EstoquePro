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

  if (!usuario || (usuario.tipo !== 'admin' && !usuario.is_admin)) return null

  return { userId: data.user.id, workspaceId: usuario.workspace_id }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = await verifyAdminToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { employeeId, newPassword } = await req.json()
    if (!employeeId || !newPassword) throw new Error('Campos obrigatórios ausentes: employeeId, newPassword')
    if (newPassword.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres')

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
    if (target.tipo === 'admin') throw new Error('Use o fluxo de reset por e-mail para a conta administradora')

    const { error: resetErr } = await supabase.auth.admin.updateUserById(employeeId, {
      password: newPassword,
    })

    if (resetErr) throw new Error(`Erro ao redefinir senha: ${resetErr.message}`)

    console.log(`[reset-employee-password] ✓ Senha redefinida | workspace: ${auth.workspaceId} | employee: ${employeeId}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`[reset-employee-password] Erro: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})