import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// PADRÃO OFICIAL: Criando um gerenciador de cookies para compartilhar o login entre subdomínios
const cookieStorage = {
  getItem: (key: string) => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  },
  setItem: (key: string, value: string) => {
    if (typeof document === 'undefined') return;
    // O ".vexodev.com.br" permite que auth.vexodev e estoque.vexodev leiam a mesma chave
    document.cookie = `${key}=${encodeURIComponent(value)}; domain=.vexodev.com.br; path=/; max-age=31536000; SameSite=Lax; secure`;
  },
  removeItem: (key: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=; domain=.vexodev.com.br; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: cookieStorage, // Aqui trocamos o window.localStorage pelo cookieStorage
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