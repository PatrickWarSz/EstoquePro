import { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuthStore, ModuleKey } from "@/lib/auth-store"

export function RequireAuth({
  children,
  module,
  adminOnly,
}: {
  children: ReactNode
  module?: ModuleKey
  adminOnly?: boolean
}) {
  const location = useLocation()
  
  // Pegamos o usuário de forma direta e segura
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)
  const user = getCurrentUser()

  // 1. Se não tem usuário, manda pro login e guarda de onde ele veio
  if (!user || !currentUserId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // 2. Se a página é só de admin e ele não é, manda pro estoque
  if (adminOnly && user.kind !== "admin") {
    return <Navigate to="/app/estoque" replace />
  }

  // 3. Se a página exige um módulo e ele não tem permissão, acha o primeiro que ele tem
  if (module && user.kind !== "admin" && !user.permissions[module]) {
    const order: ModuleKey[] =["estoque", "scanner", "pedidos", "fornecedores", "historico", "etiquetas", "configuracoes"]
    const fallback = order.find((m) => user.permissions[m])
    
    // Se ele não tem permissão pra NADA, desloga e manda pro login
    if (!fallback) {
       return <Navigate to="/login" replace />
    }
    return <Navigate to={`/app/${fallback}`} replace />
  }

  // Se passou por toda a segurança, exibe a tela
  return <>{children}</>
}