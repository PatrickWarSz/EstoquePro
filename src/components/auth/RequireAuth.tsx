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
  const user = useAuthStore((s) => s.getCurrentUser())

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (adminOnly && user.kind !== "admin") {
    return <Navigate to="/app/estoque" replace />
  }
  if (module && !user.permissions[module]) {
    // First permitted module fallback
    const order: ModuleKey[] = ["estoque", "scanner", "pedidos", "fornecedores", "historico", "etiquetas", "configuracoes"]
    const fallback = order.find((m) => user.permissions[m])
    return <Navigate to={fallback ? `/app/${fallback}` : "/login"} replace />
  }
  return <>{children}</>
}
