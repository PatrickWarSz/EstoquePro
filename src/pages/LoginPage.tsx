import { FormEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Boxes, Lock, User, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { useAuthStore, ModuleKey } from "@/lib/auth-store"
import { toast } from "sonner"

export default function LoginPage() {
  const navigate = useNavigate()
  
  const admin = useAuthStore((s) => s.admin)
  const setupAdmin = useAuthStore((s) => s.setupAdmin)
  const login = useAuthStore((s) => s.login)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [documentId, setDocumentId] = useState("")
  const [loading, setLoading] = useState(false)

  const isFirstSetup = !admin

  useEffect(() => {
    const user = getCurrentUser()
    if (user) {
      if (user.kind === "admin") {
        navigate("/app/estoque", { replace: true })
        return
      }
      
      const order: ModuleKey[] =["estoque", "scanner", "pedidos", "fornecedores", "historico", "etiquetas", "configuracoes"]
      const fallback = order.find((m) => user.permissions[m])
      
      if (fallback) {
        navigate(`/app/${fallback}`, { replace: true })
      } else {
        toast.error("Você não tem permissão de acesso a nenhuma tela.")
      }
    }
  }, [getCurrentUser, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!username.trim() || !password) {
      toast.error("Preencha usuário e senha")
      return
    }
    
    setLoading(true)
    
    try {
      if (isFirstSetup) {
        if (password.length < 4) {
          toast.error("A senha deve ter pelo menos 4 caracteres")
          setLoading(false)
          return
        }
        if (!documentId.trim() || documentId.replace(/\D/g, '').length < 11) {
          toast.error("Informe um CPF ou CNPJ válido")
          setLoading(false)
          return
        }

        try {
           await setupAdmin({ username, password, name: "Administrador", documentId })
           toast.success("Conta criada com sucesso!")
           navigate("/app/estoque", { replace: true })
        } catch (err: any) {
           toast.error(err.message || "Erro ao criar conta")
        }

      } else {
        const res = await login(username, password)
        if (!res.ok) {
          toast.error(res.error)
          setLoading(false)
          return
        }
        toast.success("Bem-vindo!")
        
        const user = getCurrentUser()
        if (user && user.kind !== "admin") {
           const order: ModuleKey[] =["estoque", "scanner", "pedidos", "fornecedores", "historico", "etiquetas", "configuracoes"]
           const fallback = order.find((m) => user.permissions[m])
           if (fallback) {
             navigate(`/app/${fallback}`, { replace: true })
             return
           }
        }
        navigate("/app/estoque", { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-t-4 border-t-primary">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-primary">
            {'>'} V E X O {'<'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isFirstSetup 
              ? "Crie sua conta para começar"
              : "Painel de Acesso Seguro"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {isFirstSetup && (
            <div className="space-y-2">
              <Label htmlFor="document">CPF ou CNPJ</Label>
              <div className="relative">
                <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="document"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="Apenas números"
                  className="pl-10 h-11"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: marcos_admin"
                className="pl-10 h-11"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 h-11"
                autoComplete={isFirstSetup ? "new-password" : "current-password"}
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-11 text-md font-bold mt-2" disabled={loading}>
            {loading ? "Processando..." : (isFirstSetup ? "Criar Workspace VEXO" : "Entrar no Sistema")}
          </Button>
        </form>
      </Card>
    </div>
  )
}