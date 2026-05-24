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
  const user = getCurrentUser()

  // 1. Não está logado → auth centralizado
  if (!user || !currentUserId) {
    window.location.replace(AUTH_URL)
    return null
  }

  // 2. Inadimplente ou cancelado → só configurações
  if (
    (subscriptionStatus === "past_due" || subscriptionStatus === "canceled") &&
    module !== "configuracoes"
  ) {
    window.location.replace("/app/configuracoes")
    return null
  }

  // 3. Página só de admin e ele não é → estoque
  if (adminOnly && user.kind !== "admin" && !user.isAdmin) {
    window.location.replace("/app/estoque")
    return null
  }

  // 4. Sem permissão para o módulo → primeiro módulo disponível
  if (module && user.kind !== "admin" && !user.permissions[module]) {
    const order: ModuleKey[] = [
      "estoque",
      "scanner",
      "pedidos",
      "fornecedores",
      "historico",
      "etiquetas",
      "configuracoes",
    ]
    const fallback = order.find((m) => user.permissions[m])
    if (!fallback) {
      // Sem nenhum módulo → volta para o auth
      window.location.replace(AUTH_URL)
      return null
    }
    window.location.replace(`/app/${fallback}`)
    return null
  }

  return <>{children}</>
}