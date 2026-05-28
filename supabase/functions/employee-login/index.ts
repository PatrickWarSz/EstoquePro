import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  'https://auth.vexodev.com.br',
  'https://app.vexodev.com.br',
  'https://estoque.vexodev.com.br', // Agora sim, correto!
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

function normalizeSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const rawLogin: string = (body.login ?? '').trim()
    const password: string = (body.password ?? '').trim()

    if (!rawLogin || !password) {
      return new Response(
        JSON.stringify({ error: 'Preencha o usuario/login e a senha.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const atIndex = rawLogin.indexOf('@')
    const isOwnerEmail = atIndex > 0 && rawLogin.slice(atIndex).includes('.')
    const isEmployeeFormat = atIndex > 0 && !rawLogin.slice(atIndex).includes('.')

    // FLUXO: DONO (email real como email@gmail.com)
    if (isOwnerEmail || atIndex < 0) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: rawLogin,
        password,
      })

      if (error || !data.session) {
        return new Response(
          JSON.stringify({ error: 'E-mail ou senha incorretos.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, workspace_id, nome, username, tipo, permissoes, is_admin, ativo')
        .eq('id', data.user.id)
        .maybeSingle()

      return new Response(
        JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: {
            id: data.user.id,
            email: data.user.email,
            tipo: usuario?.tipo ?? 'admin',
            nome: usuario?.nome ?? '',
            workspace_id: usuario?.workspace_id ?? null,
            is_admin: usuario?.is_admin ?? false,
            permissoes: usuario?.permissoes ?? {},
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // FLUXO: FUNCIONARIO (formato usuario@empresa)
    if (isEmployeeFormat) {
      const username = rawLogin.slice(0, atIndex).toLowerCase().trim()
      const slug     = normalizeSlug(rawLogin.slice(atIndex + 1).trim())

      if (!username || !slug) {
        return new Response(
          JSON.stringify({ error: 'Formato invalido. Use: usuario@empresa' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id, cnpj_cpf, nome_empresa, slug')
        .eq('slug', slug)
        .maybeSingle()

      if (!workspace) {
        return new Response(
          JSON.stringify({ error: 'Empresa nao encontrada. Verifique o login.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, workspace_id, nome, username, tipo, permissoes, is_admin, ativo')
        .eq('workspace_id', workspace.id)
        .ilike('username', username)
        .eq('ativo', true)
        .is('deleted_at', null)
        .maybeSingle()

      if (!usuario) {
        return new Response(
          JSON.stringify({ error: 'Usuario nao encontrado ou inativo.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const virtualEmail = username + '@' + workspace.cnpj_cpf + '.vexo'

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: virtualEmail,
        password,
      })

      if (authErr || !authData.session) {
        return new Response(
          JSON.stringify({ error: 'Usuario ou senha incorretos.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          user: {
            id: usuario.id,
            email: virtualEmail,
            tipo: usuario.tipo,
            nome: usuario.nome,
            workspace_id: usuario.workspace_id,
            is_admin: usuario.is_admin,
            permissoes: usuario.permissoes ?? {},
            empresa_slug: slug,
            empresa_nome: workspace.nome_empresa,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Formato de login invalido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[employee-login] Erro: ' + err.message)
    return new Response(
      JSON.stringify({ error: 'Erro interno. Tente novamente.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})