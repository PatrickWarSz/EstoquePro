import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function parseEnv(path) {
  const txt = fs.readFileSync(path, 'utf8')
  const res = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([^=]+)=(.*)$/)
    if (m) res[m[1].trim()] = m[2].trim()
  }
  return res
}

async function run() {
  try {
    const envPath = process.cwd() + '/.env'
    const env = parseEnv(envPath)
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('.env missing Supabase vars')

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const email = `test.e2e.${Date.now()}@example.com`
    const password = 'Test1234!'
    console.log('Signing up user:', email)
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({ email, password })
    if (signupErr && signupErr.message && !signupErr.message.includes('duplicate')) throw signupErr

    // If signUp doesn't return a session, sign in
    let session
    if (signupData?.session) session = signupData.session
    else {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      session = signInData.session
    }

    console.log('User session acquired')

    // helper: generate valid CPF
    function generateCPF() {
      const rand = () => Math.floor(Math.random() * 9)
      const nums = Array.from({length:9}, () => rand())
      const calc = (arr) => {
        let sum = arr.reduce((s, n, i) => s + n * (arr.length + 1 - i), 0)
        let rem = sum % 11
        return rem < 2 ? 0 : 11 - rem
      }
      const d1 = calc(nums)
      const d2 = calc([...nums, d1])
      return nums.join('') + String(d1) + String(d2)
    }

    const documentId = generateCPF()

    // Create workspace
    const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate()+15)
    const { data: ws, error: wsErr } = await supabase.from('workspaces').insert([{ cnpj_cpf: documentId, nome_empresa: 'E2E Test Ltd', cpf_titular: documentId, status_assinatura: 'trialing', plano_atual: 'estoque_pro', data_vencimento: trialEnd.toISOString() }]).select().single()
    if (wsErr) throw wsErr
    console.log('Workspace created:', ws.id)

    // Create usuario mapping
    const { data: u, error: uErr } = await supabase.from('usuarios').insert([{ id: signupData.user?.id || session.user.id, workspace_id: ws.id, nome: 'E2E User', username: email, tipo: 'admin', permissoes: { estoque:true, pedidos:true, fornecedores:true, historico:true, scanner:true, etiquetas:true, configuracoes:true }, ativo: true, senha_hash: 'migrated' }]).select().single()
    if (uErr) throw uErr
    console.log('Usuario row created')

    const token = session?.access_token
    if (!token) throw new Error('No access token available')

    // Call asaas-customer to create customer
    console.log('Calling asaas-customer...')
    const phone = '5511999887766'
    const customerRes = await fetch(`${supabaseUrl}/functions/v1/asaas-customer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId: ws.id, companyName: 'E2E Test Ltd', documentId: documentId, email, phone })
    })
    const customerJson = await customerRes.json()
    console.log('asaas-customer response status', customerRes.status, customerJson)
    if (!customerRes.ok) throw new Error('asaas-customer failed: '+JSON.stringify(customerJson))

    // Now call asaas-checkout to create subscription and get invoice
    console.log('Calling asaas-checkout...')
    const checkoutRes = await fetch(`${supabaseUrl}/functions/v1/asaas-checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId: ws.id, plan: 'monthly' })
    })
    const checkoutJson = await checkoutRes.json()
    console.log('asaas-checkout response status', checkoutRes.status, checkoutJson)

    if (!checkoutRes.ok) throw new Error('asaas-checkout failed: '+JSON.stringify(checkoutJson))

    console.log('E2E success. Invoice URL:', checkoutJson.invoiceUrl)
  } catch (err) {
    console.error('E2E error:', err)
    process.exit(1)
  }
}

run()
