import { FormEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Boxes, Lock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { useAuthStore, ModuleKey } from "@/lib/auth-store"
import { toast } from "sonner"

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const resetPassword = useAuthStore((s) => s.resetPassword)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const user = getCurrentUser()
    if (user) {
      if (user.kind === "admin") {
        navigate("/app/estoque", { replace: true })
        return
      }
      const order: ModuleKey[] = ["estoque", "scanner", "pedidos", "fornecedores", "historico", "etiquetas", "configuracoes"]
      const fallback = order.find((m) => user.permissions[m])
      if (fallback) navigate(`/app/${fallback}`, { replace: true })
    }
  }, [currentUserId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error("Preencha usuário e senha")
      return
    }
    setLoading(true)
    try {
      const res = await login(username, password)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Bem-vindo!")
      navigate("/app/estoque", { replace: true })
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado")
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
            Painel de Acesso Seguro
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="username">E-mail ou Usuário de Acesso</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: admin@loja.com ou joao_estoque"
                className="pl-10 h-11"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={async () => {
                  if (!username.trim() || !username.includes('@')) {
                    toast.error("Digite seu e-mail no campo acima para recuperar a senha.")
                    return
                  }
                  toast.loading("Enviando e-mail de recuperação...")
                  const res = await resetPassword(username)
                  toast.dismiss()
                  if (res.ok) toast.success("E-mail enviado! Verifique sua caixa de entrada e spam.")
                  else toast.error("Erro ao enviar: " + res.error)
                }}
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 h-11"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-md font-bold mt-2"
            disabled={loading}
          >
            {loading ? "Validando..." : "Entrar no Sistema"}
          </Button>

          {/* ─── Link para o auth centralizado ─────────────────────────────── */}
          <a
            href="https://auth.vexodev.com.br/?app=estoque"
            className="w-full h-11 text-sm flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            Não tem conta? Criar sua empresa →
          </a>
        </form>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 px-4 leading-relaxed">
          Ao continuar, você concorda com os <br />
          <a href="#" className="underline hover:text-primary transition-colors">Termos de Serviço</a> e com a{" "}
          <a href="#" className="underline hover:text-primary transition-colors">Política de Privacidade</a> da V E X O.
        </p>
      </Card>
    </div>
  )
}