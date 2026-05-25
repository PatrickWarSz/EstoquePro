import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // CRÍTICO: Persistir sessão no localStorage para compartilhar entre domínios
    persistSession: true,
    
    // CRÍTICO: Detectar mudanças de sessão automaticamente (login em outra aba/domínio)
    autoRefreshToken: true,
    detectSessionInUrl: true,
    
    // SEGURANÇA: Usar cookie storage para session sharing cross-domain
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    
    // CRÍTICO: Configurar cookies para funcionar em subdomínios (.vexodev.com.br)
    flowType: 'pkce', // PKCE flow é mais seguro que implicit
  },
})

// SEGURANÇA: Listener de mudanças de auth (login/logout em auth.vexodev.com.br reflete aqui)
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase Auth]', event, session?.user?.email || 'no user')
  
  // Se o usuário fez logout no auth centralizado, limpar aqui também
  if (event === 'SIGNED_OUT') {
    // Força limpeza do auth-store via evento customizado
    window.dispatchEvent(new CustomEvent('supabase-signed-out'))
  }
})