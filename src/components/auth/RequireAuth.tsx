import { ReactNode } from "react"
import { useAuthStore, ModuleKey } from "@/lib/auth-store"

const AUTH_URL = "https://auth.vexodev.com.br/?app=estoque"

export function RequireAuth({
  children,
  module,
  adminOnly,
}: {
  children: ReactNode
  module?: ModuleKey
  adminOnly?: boolean
}) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus)
  const isInitializing = useAuthStore((s) => s.isInitializing)
  
  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
      </div>
    )
  }

  const user = getCurrentUser()

  // 📡 RADAR DE DEBUG: Mostra na Consola quem está a tentar entrar!
  console.log("🔍 [RequireAuth] Analisando acesso...", { currentUserId, user, module })

  // 1. Não está logado ou não conseguiu carregar o perfil da tabela 'usuarios'
  if (!user || !currentUserId) {
    console.warn("🚫 [RequireAuth] Expulso na Condição 1: Perfil (user) não foi carregado da Store!")
    window.location.replace(AUTH_URL)
    return null
  }

  // 2. Inadimplente ou cancelado
  if (
    (subscriptionStatus === "past_due" || subscriptionStatus === "canceled") &&
    module !== "configuracoes"
  ) {
    window.location.replace("/app/configuracoes")
    return null
  }

  // 🔴 CORREÇÃO CHAVE: Aceita as variáveis quer venham em inglês (kind) ou português (tipo do BD)
  const isUserAdmin = 
    (user as any).kind === "admin" || 
    (user as any).tipo === "admin" || 
    (user as any).isAdmin === true;
    
  const permissoes = (user as any).permissions || (user as any).permissoes || {};

  // 3. Página só de admin
  if (adminOnly && !isUserAdmin) {
    console.warn("🚫 [RequireAuth] Expulso na Condição 3: Rota exclusiva para Admins.")
    window.location.replace("/app/estoque")
    return null
  }

  // 4. Sem permissão para o módulo
  if (module && !isUserAdmin && !permissoes[module]) {
    console.warn(`🚫 [RequireAuth] Expulso na Condição 4: Falta permissão para '${module}'.`)
    const order: ModuleKey[] = [
      "estoque",
      "scanner",
      "pedidos",
      "fornecedores",
      "somatorios",
      "historico",
      "etiquetas",
      "configuracoes",
    ]
    const fallback = order.find((m) => permissoes[m])
    
    if (!fallback) {
      console.warn("🚫 [RequireAuth] Expulso na Condição 4: Utilizador não tem NENHUMA permissão alternativa (fallback).")
      window.location.replace(AUTH_URL)
      return null
    }
    
    window.location.replace(`/app/${fallback}`)
    return null
  }

  return <>{children}</>
}