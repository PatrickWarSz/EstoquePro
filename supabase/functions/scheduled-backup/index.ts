import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

// Chamada pelo GitHub Actions via CRON_SECRET — nunca exposta ao frontend
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

serve(async (req) => {
  // Autenticação: só GitHub Actions pode chamar esta função
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Buscar todos os workspaces ativos (assinatura ativa ou em trial)
  const { data: workspaces, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, nome_empresa, status_assinatura')
    .in('status_assinatura', ['active', 'trial', 'trialing'])

  if (wsErr || !workspaces?.length) {
    console.log('[scheduled-backup] Nenhum workspace ativo encontrado.')
    return new Response(JSON.stringify({ ok: true, backed_up: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const results: { workspace: string; status: string; error?: string }[] = []

  for (const ws of workspaces) {
    try {
      await backupWorkspace(supabase, ws.id, ws.nome_empresa)
      results.push({ workspace: ws.nome_empresa, status: 'ok' })
      console.log(`[scheduled-backup] ✓ ${ws.nome_empresa} (${ws.id})`)
    } catch (err: any) {
      results.push({ workspace: ws.nome_empresa, status: 'erro', error: err.message })
      console.error(`[scheduled-backup] ✗ ${ws.nome_empresa}:`, err.message)

      // Registrar falha no log para rastreabilidade
      const errId = `backup-err-${Date.now()}`
      await supabase.from('backup_logs').insert([{
        id: errId,
        workspace_id: ws.id,
        storage_path: '',
        tamanho_bytes: 0,
        status: 'erro',
        erro_msg: err.message,
      }]).catch(() => {})
    }
  }

  const ok = results.filter(r => r.status === 'ok').length
  const fail = results.filter(r => r.status === 'erro').length
  console.log(`[scheduled-backup] Concluído: ${ok} ok, ${fail} erros`)

  return new Response(JSON.stringify({ ok: true, backed_up: ok, errors: fail, results }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

async function backupWorkspace(supabase: any, workspaceId: string, nomeEmpresa: string) {
  // Buscar todos os dados do workspace — server-side, sem limite de 500 linhas
  const [
    usuariosRes, produtosRes, categoriasRes,
    movimentacoesRes, locaisRes, pedidosRes,
    fornecedoresRes, entregasRes, aliasesRes,
    conferenciasRes
  ] = await Promise.all([
    supabase.from('usuarios').select('*').eq('workspace_id', workspaceId),
    // Produtos: incluir inativos mas excluir hard-deletados (que já não existem)
    supabase.from('produtos').select('*').eq('workspace_id', workspaceId),
    supabase.from('categorias').select('*').eq('workspace_id', workspaceId),
    supabase.from('movimentacoes').select('*').eq('workspace_id', workspaceId).order('data', { ascending: false }),
    supabase.from('locais_estoque').select('*').eq('workspace_id', workspaceId),
    supabase.from('pedidos').select('*').eq('workspace_id', workspaceId),
    supabase.from('fornecedores').select('*').eq('workspace_id', workspaceId),
    supabase.from('entregas_pedido').select('*').eq('workspace_id', workspaceId),
    supabase.from('aliases_qr').select('*').eq('workspace_id', workspaceId),
    supabase.from('conferencias_estoque').select('*').eq('workspace_id', workspaceId),
  ])

  const timestamp = new Date().toISOString()
  const backup = {
    _meta: {
      version: '2.0',
      app: 'EstoquePro',
      workspace_id: workspaceId,
      nome_empresa: nomeEmpresa,
      timestamp,
      // Contadores para auditoria rápida sem abrir o arquivo
      totais: {
        produtos: (produtosRes.data || []).length,
        categorias: (categoriasRes.data || []).length,
        movimentacoes: (movimentacoesRes.data || []).length,
        pedidos: (pedidosRes.data || []).length,
        fornecedores: (fornecedoresRes.data || []).length,
        usuarios: (usuariosRes.data || []).length,
      }
    },
    usuarios: usuariosRes.data || [],
    produtos: produtosRes.data || [],
    categorias: categoriasRes.data || [],
    movimentacoes: movimentacoesRes.data || [],
    locais_estoque: locaisRes.data || [],
    pedidos: pedidosRes.data || [],
    entregas_pedido: entregasRes.data || [],
    fornecedores: fornecedoresRes.data || [],
    aliases_qr: aliasesRes.data || [],
    conferencias_estoque: conferenciasRes.data || [],
  }

  const json = JSON.stringify(backup)
  const bytes = new TextEncoder().encode(json)

  const backupId = `backup-${Date.now()}`
  const storagePath = `${workspaceId}/${backupId}.json`

  // Upload para o Supabase Storage
  const { error: upErr } = await supabase.storage
    .from('backups')
    .upload(storagePath, bytes, {
      contentType: 'application/json',
      upsert: false,
    })

  if (upErr) throw new Error(`Storage upload falhou: ${upErr.message}`)

  // Registrar no log
  const { error: logErr } = await supabase.from('backup_logs').insert([{
    id: backupId,
    workspace_id: workspaceId,
    storage_path: storagePath,
    tamanho_bytes: bytes.length,
    status: 'ok',
    criado_em: timestamp,
  }])

  if (logErr) throw new Error(`Log insert falhou: ${logErr.message}`)

  // Retenção: manter só os últimos 7 backups deste workspace
  await supabase.rpc('cleanup_old_backups', { p_workspace_id: workspaceId })
}