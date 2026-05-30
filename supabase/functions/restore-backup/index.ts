import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const ALLOWED_ORIGINS = [
  'https://app.vexo.com.br',
  'https://www.vexo.com.br',
  'https://app.vexodev.com.br',
  'https://vexo.com.br',
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

    const { backupId } = await req.json()
    if (!backupId) throw new Error('backupId obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Buscar o log do backup e validar que pertence ao workspace do chamador
    const { data: log, error: logErr } = await supabase
      .from('backup_logs')
      .select('*')
      .eq('id', backupId)
      .eq('status', 'ok')
      .single()

    if (logErr || !log) throw new Error('Backup não encontrado ou com erro')

    // SEGURANÇA: workspace do backup deve ser o mesmo do admin autenticado
    if (log.workspace_id !== auth.workspaceId) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Baixar o arquivo JSON do Storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('backups')
      .download(log.storage_path)

    if (dlErr || !fileData) throw new Error(`Erro ao baixar backup: ${dlErr?.message}`)

    const json = await fileData.text()
    const backup = JSON.parse(json)

    // 3. Validar estrutura mínima do backup
    if (!backup._meta || backup._meta.workspace_id !== auth.workspaceId) {
      throw new Error('Backup inválido ou de workspace diferente')
    }

    const wId = auth.workspaceId

    // 4. RESTAURAÇÃO — deletar em ordem reversa de FK, depois inserir em ordem direta
    // Ordem de deleção (do mais dependente para o mais base)
    const deleteOrder = [
      'conferencias_estoque',
      'aliases_qr',
      'movimentacoes',
      'entregas_pedido',
      'pedidos',
      'produto_variantes',
      'locais_estoque',
      'produtos',
      'fornecedores',
      'categorias',
    ]

    for (const table of deleteOrder) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('workspace_id', wId)
      // produto_variantes pode não ter workspace_id direto — ignorar erro
      if (error && table !== 'produto_variantes') {
        console.warn(`[restore-backup] Aviso ao deletar ${table}: ${error.message}`)
      }
    }

    // 5. Inserir em ordem direta de FK (base → dependentes)
    const insertOrder: Array<{ table: string; key: keyof typeof backup }> = [
      { table: 'categorias',          key: 'categorias' },
      { table: 'fornecedores',        key: 'fornecedores' },
      { table: 'locais_estoque',      key: 'locais_estoque' },
      { table: 'produtos',            key: 'produtos' },
      { table: 'pedidos',             key: 'pedidos' },
      { table: 'entregas_pedido',     key: 'entregas_pedido' },
      { table: 'movimentacoes',       key: 'movimentacoes' },
      { table: 'aliases_qr',          key: 'aliases_qr' },
      { table: 'conferencias_estoque',key: 'conferencias_estoque' },
    ]

    const erros: string[] = []

    for (const { table, key } of insertOrder) {
      const rows: any[] = backup[key] || []
      if (rows.length === 0) continue

      // Forçar workspace_id correto em todos os registros (proteção extra)
      const sanitized = rows.map((r: any) => ({ ...r, workspace_id: wId }))

      // Inserir em lotes de 500 para não estourar o limite do Supabase
      const BATCH = 500
      for (let i = 0; i < sanitized.length; i += BATCH) {
        const chunk = sanitized.slice(i, i + BATCH)
        const { error } = await supabase.from(table).insert(chunk)
        if (error) {
          erros.push(`${table}: ${error.message}`)
          console.error(`[restore-backup] Erro em ${table}:`, error.message)
        }
      }
    }

    // produto_variantes — tabela que pode não ter workspace_id, inserir separado
    if (backup.produto_variantes?.length > 0) {
      const { error } = await supabase
        .from('produto_variantes')
        .insert(backup.produto_variantes)
      if (error) console.warn('[restore-backup] produto_variantes:', error.message)
    }

    if (erros.length > 0) {
      console.warn(`[restore-backup] Concluído com ${erros.length} aviso(s)`)
    }

    console.log(
      `[restore-backup] ✓ workspace: ${wId} | backup: ${backupId} | ` +
      `produtos: ${backup._meta.totais?.produtos ?? '?'} | ` +
      `mov: ${backup._meta.totais?.movimentacoes ?? '?'}`
    )

    return new Response(JSON.stringify({
      success: true,
      restaurado_em: new Date().toISOString(),
      totais: backup._meta.totais,
      avisos: erros,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`[restore-backup] Erro fatal: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})