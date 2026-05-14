import { FormEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Boxes, Lock, User, FileText, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { useAuthStore, ModuleKey } from "@/lib/auth-store"
import { toast } from "sonner"

// --- FUNÇÃO MATEMÁTICA DE VALIDAÇÃO (CPF E CNPJ) ---
function isValidDocument(doc: string) {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) {
    if (/^(\d)\1+$/.test(digits)) return false;
    let sum = 0, rev;
    for (let i = 0; i < 9; i++) sum += parseInt(digits.charAt(i)) * (10 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(10))) return false;
    return true;
  }
  if (digits.length === 14) {
    if (/^(\d)\1+$/.test(digits)) return false;
    let size = digits.length - 2;
    let nums = digits.substring(0, size);
    const dig = digits.substring(size);
    let sum = 0, pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(nums.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(dig.charAt(0))) return false;
    size = size + 1;
    nums = digits.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(nums.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(dig.charAt(1))) return false;
    return true;
  }
  return false;
}

export default function LoginPage() {
  const navigate = useNavigate()
  // 1. Removemos o detector automático de admin
  const setupAdmin = useAuthStore((s) => s.setupAdmin)
  const login = useAuthStore((s) => s.login)
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const resetPassword = useAuthStore((s) => s.resetPassword) 

  const [username, setUsername] = useState("")
  const[password, setPassword] = useState("")
  const [documentId, setDocumentId] = useState("")
  const [ownerCpf, setOwnerCpf] = useState("")
  const [phone, setPhone] = useState("")
  const[companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(false)
  
  // 2. Criamos o estado manual de alternância
  const[isRegistering, setIsRegistering] = useState(false)

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
      if (isRegistering) {
  const cleanDoc = documentId.replace(/\D/g, '')
  if (!cleanDoc) {
    toast.error("Informe o CPF ou CNPJ da empresa.")
    setLoading(false)
    return
  }
  if (!isValidDocument(cleanDoc)) {
    toast.error("CPF ou CNPJ inválido. Verifique os números e tente novamente.")
    setLoading(false)
    return
  }
        if (!companyName.trim()) {
          toast.error("Informe o nome da sua empresa.")
          setLoading(false)
          return
        }
        if (password.length < 4) {
          toast.error("A senha deve ter pelo menos 4 caracteres")
          setLoading(false)
          return
        }

     
        await setupAdmin({ username, password, name: "Administrador", documentId, companyName, ownerCpf, phone })
        toast.success("Empresa cadastrada com sucesso! Faça seu login para continuar.")
navigate("/login", { replace: true })

      } else {
        const res = await login(username, password)
        if (!res.ok) {
          toast.error(res.error)
          setLoading(false)
          return
        }
        toast.success("Bem-vindo!")
        navigate("/app/estoque", { replace: true })
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na operação")
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
            {isRegistering ? "Inicie seu Workspace profissional" : "Painel de Acesso Seguro"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isRegistering && (
            <>
              <div className="space-y-2">
                <Label htmlFor="company">Nome da Empresa / Marca</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Delicatta Fit Store"
                    className="pl-10 h-11"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">CNPJ da Empresa (ou seu CPF)</Label>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
  id="document"
  value={documentId}
  onChange={(e) => setDocumentId(e.target.value.replace(/\D/g, ''))}
  placeholder="Apenas números (CPF ou CNPJ)"
  maxLength={14}
  className="pl-10 h-11"
/>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerCpf">CPF do Titular Responsável</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="ownerCpf"
                    value={ownerCpf}
                    onChange={(e) => setOwnerCpf(e.target.value)}
                    placeholder="Necessário para segurança e assinatura"
                    className="pl-10 h-11"
                  />
                </div>
              </div>
            </>
          )}

{isRegistering && (
  <div className="space-y-2">
    <Label htmlFor="phone">WhatsApp / Celular do Financeiro</Label>
    <div className="relative">
      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="(11) 99999-9999"
        className="pl-10 h-11"
      />
    </div>
  </div>
)}

          <div className="space-y-2">
            <Label htmlFor="username">{isRegistering ? "E-mail Profissional (Para Login e Faturas)" : "E-mail ou Usuário de Acesso"}</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegistering ? "contato@suaempresa.com" : "Ex: admin@loja.com ou joao_estoque"}
                className="pl-10 h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              {!isRegistering && (
                <button 
                  type="button" 
                  className="text-xs font-semibold text-primary hover:underline" 
                  onClick={async () => {
                    if (!username.trim() || !username.includes('@')) {
                      toast.error("Digite seu e-mail no campo 'Usuário' para recuperar a senha.");
                      return;
                    }
                    toast.loading("Enviando e-mail de recuperação...");
                    const res = await resetPassword(username);
                    toast.dismiss();
                    if (res.ok) toast.success("E-mail enviado! Verifique sua caixa de entrada e spam.");
                    else toast.error("Erro ao enviar: " + res.error);
                  }}
                >
                  Esqueci minha senha
                </button>
              )}
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

          <Button type="submit" className="w-full h-11 text-md font-bold mt-2" disabled={loading}>
            {loading ? "Validando..." : (isRegistering ? "Criar Empresa na VEXO" : "Entrar no Sistema")}
          </Button>

          <Button 
            type="button" 
            variant="ghost" 
            className="w-full h-11 text-sm mt-2 text-muted-foreground hover:text-primary"
            onClick={() => setIsRegistering(!isRegistering)}
          >
            {isRegistering ? "Já tem conta? Entrar no Sistema" : "Não tem conta? Criar Empresa"}
          </Button>
        </form>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 px-4 leading-relaxed">
          Ao continuar, você concorda com os <br />
          <a href="#" className="underline hover:text-primary transition-colors">Termos de Serviço</a> e com a <a href="#" className="underline hover:text-primary transition-colors">Política de Privacidade</a> da V E X O.
        </p>
      </Card>
    </div>
  )
}