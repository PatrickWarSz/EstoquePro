import { FormEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Boxes, Lock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { useAuthStore } from "@/lib/auth-store"
import { toast } from "sonner"

export default function LoginPage() {
  const navigate = useNavigate()
  
  // Pegamos as funções e variáveis individualmente para o Zustand não travar
  const admin = useAuthStore((s) => s.admin)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const setupAdmin = useAuthStore((s) => s.setupAdmin)
  const login = useAuthStore((s) => s.login)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(false)

  const isFirstSetup = !admin

  // A MÁGICA ACONTECE AQUI: Agora ele só redireciona se o usuário for VÁLIDO, não apenas se tiver um ID
  useEffect(() => {
    if (getCurrentUser()) {
      navigate("/app/estoque", { replace: true })
    }
  }, [currentUserId, navigate, getCurrentUser])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // ... O RESTO DO SEU CÓDIGO FICA EXATAMENTE IGUAL ...

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error("Preencha usuário e senha")
      return
    }
    setLoading(true)
    try {
      if (isFirstSetup) {
        if (!name.trim()) {
          toast.error("Informe seu nome")
          return
        }
        if (password.length < 4) {
          toast.error("A senha deve ter pelo menos 4 caracteres")
          return
        }
        await setupAdmin({ username, password, name, companyName })
        toast.success("Conta de administrador criada")
        navigate("/app/estoque", { replace: true })
      } else {
        const res = await login(username, password)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("Bem-vindo!")
        navigate("/app/estoque", { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Boxes className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Estoque Pro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFirstSetup
              ? "Crie a conta do administrador para começar"
              : "Entre com suas credenciais"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isFirstSetup && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Seu nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João Silva"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Empresa (opcional)</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Nome da sua empresa"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="username">Usuário</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="usuario"
                className="pl-9"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                autoComplete={isFirstSetup ? "new-password" : "current-password"}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : isFirstSetup ? "Criar conta de administrador" : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
