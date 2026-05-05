import { createClient } from '@supabase/supabase-js'

// Estas são as variáveis de ambiente que o Vite vai procurar
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltam as credenciais do Supabase. Verifique o arquivo .env')
}

// Cria a conexão oficial que usaremos no projeto inteiro
export const supabase = createClient(supabaseUrl, supabaseAnonKey)