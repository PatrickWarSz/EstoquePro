import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Armazenamento híbrido da sessão:
// - localStorage é a fonte principal (não sofre o limite de 4KB nem a expiração
//   de 7 dias que o iOS impõe a cookies criados por JavaScript — era isso que
//   fazia o app "congelar" no celular até deslogar e logar de novo).
// - Cookies em .vexodev.com.br continuam sendo espelhados para que o login
//   feito em auth.vexodev.com.br seja reconhecido aqui (e vice-versa).
const COOKIE_DOMAIN = '.vexodev.com.br'
const CHUNK_SIZE = 3000

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return match ? decodeURIComponent(match[2]) : null
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; domain=${COOKIE_DOMAIN}; path=/; max-age=31536000; SameSite=Lax; secure`
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; domain=${COOKIE_DOMAIN}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function readCookieValue(key: string): string | null {
  const single = readCookie(key)
  if (single) return single
  // Valor grande foi dividido em pedaços key.0, key.1, ...
  let out = ''
  for (let i = 0; i < 10; i++) {
    const part = readCookie(`${key}.${i}`)
    if (!part) break
    out += part
  }
  return out || null
}

function writeCookieValue(key: string, value: string) {
  if (value.length <= CHUNK_SIZE) {
    writeCookie(key, value)
    for (let i = 0; i < 10; i++) deleteCookie(`${key}.${i}`)
    return
  }
  deleteCookie(key)
  const chunks: string[] = []
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE))
  chunks.forEach((c, i) => writeCookie(`${key}.${i}`, c))
  for (let i = chunks.length; i < 10; i++) deleteCookie(`${key}.${i}`)
}

const hybridStorage = {
  getItem: (key: string) => {
    try {
      const local = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
      if (local) return local
    } catch { /* ignore */ }
    const fromCookie = readCookieValue(key)
    if (fromCookie) {
      // Reidrata o localStorage para que a sessão sobreviva ao ITP do iOS
      try { localStorage.setItem(key, fromCookie) } catch { /* ignore */ }
    }
    return fromCookie
  },
  setItem: (key: string, value: string) => {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
    try { writeCookieValue(key, value) } catch { /* ignore */ }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    try {
      deleteCookie(key)
      for (let i = 0; i < 10; i++) deleteCookie(`${key}.${i}`)
    } catch { /* ignore */ }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: hybridStorage,
    flowType: 'pkce',
  },
})

// Listener de mudanças de auth
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase Auth]', event, session?.user?.email || 'no user')
  if (event === 'SIGNED_OUT') {
    window.dispatchEvent(new CustomEvent('supabase-signed-out'))
  }
})

/**
 * Garante um token válido antes de consultar o banco.
 * Retorna a sessão ativa ou null quando o login realmente expirou.
 */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  let session = data.session
  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0
  const expiringSoon = expiresAt > 0 && expiresAt - Date.now() < 60_000
  if (!session || expiringSoon) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession()
      session = refreshed.session || session
    } catch { /* ignore */ }
  }
  return session ?? null
}
