import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  UserPlus,
  Users,
  Trash2,
  KeyRound,
  Copy,
  Share2,
  History as HistoryIcon,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ALL_MODULES,
  Employee,
  emptyPermissions,
  ModuleKey,
  Permissions,
  useAuthStore,
} from "@/lib/auth-store"
import { toast } from "sonner"

function PermissionsEditor({
  value,
  onChange,
}: {
  value: Permissions
  onChange: (p: Permissions) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALL_MODULES.map((m) => (
        <label
          key={m.key}
          className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 hover:bg-muted/40"
        >
          <Checkbox
            checked={value[m.key]}
            onCheckedChange={(c) =>
              onChange({ ...value, [m.key]: !!c })
            }
            className="mt-0.5"
          />
          <div className="text-sm">
            <div className="font-medium leading-none">{m.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{m.description}</div>
          </div>
        </label>
      ))}
    </div>
  )
}

export default function FuncionariosPage() {
  const { employees, addEmployee, updateEmployee, removeEmployee, resetEmployeePassword } =
    useAuthStore()

  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [credentialsModal, setCredentialsModal] = useState<{
    name: string
    username: string
    password: string
  } | null>(null)

  // Form state — new
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isAdminNew, setIsAdminNew] = useState(false)
  const [perms, setPerms] = useState<Permissions>(() => ({
    ...emptyPermissions(),
    estoque: true,
    scanner: true,
  }))

  // Edit state
  const [editName, setEditName] = useState("")
  const [editPerms, setEditPerms] = useState<Permissions>(emptyPermissions())
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [resetPassword, setResetPassword] = useState("")

  const resetForm = () => {
    setName("")
    setUsername("")
    setPassword("")
    setShowPassword(false)
    setIsAdminNew(false)
    setPerms({ ...emptyPermissions(), estoque: true, scanner: true })
  }

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789"
    let p = ""
    for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)]
    setPassword(p)
    setShowPassword(true)
  }

  const handleCreate = async () => {
    const res = await addEmployee({ name, username, password, permissions: perms, isAdmin: isAdminNew })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setCredentialsModal({ name: name.trim(), username: username.trim().toLowerCase(), password })
    setOpenNew(false)
    resetForm()
    toast.success("Funcionário cadastrado")
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setEditName(emp.name)
    setEditPerms(emp.permissions)
    setEditIsAdmin(emp.isAdmin || false)
    setResetPassword("")
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    updateEmployee(editing.id, { name: editName, permissions: editPerms, isAdmin: editIsAdmin })
    if (resetPassword.trim()) {
      await resetEmployeePassword(editing.id, resetPassword.trim())
      toast.success("Senha redefinida")
    } else {
      toast.success("Funcionário atualizado")
    }
    setEditing(null)
  }

  const inviteText = useMemo(() => {
    if (!credentialsModal) return ""
    const url = `${window.location.origin}/login`
    // Ajustado para o link ficar em sua própria linha, garantindo que seja clicável no WhatsApp
    return `Olá ${credentialsModal.name}! 👋\n\nAqui estão suas credenciais de acesso ao EstoquePro:\n\nLink de acesso:\n${url}\n\nUsuário: ${credentialsModal.username}\nSenha: ${credentialsModal.password}\n\nGuarde com segurança.`
  }, [credentialsModal])

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Funcionários</h2>
          <p className="text-sm text-muted-foreground">
            {employees.length} {employees.length === 1 ? "funcionário cadastrado" : "funcionários cadastrados"}
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo funcionário
        </Button>
      </div>

      {employees.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">Nenhum funcionário ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie um login para cada operador definindo as permissões dele.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((emp) => {
            const activePerms = ALL_MODULES.filter((m) => emp.permissions[m.key])
            return (
              <Card key={emp.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{emp.name}</p>
                      {emp.isAdmin && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                          ADMIN
                        </span>
                      )}
                      {!emp.active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          DESATIVADO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">@{emp.username}</p>
                  </div>
                  <Switch
                    checked={emp.active}
                    onCheckedChange={(c) => updateEmployee(emp.id, { active: c })}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {activePerms.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">
                      Sem acesso a nenhum módulo
                    </span>
                  ) : (
                    activePerms.map((m) => (
                      <span
                        key={m.key}
                        className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {m.label}
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(emp)} className="gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" asChild className="gap-1.5">
                    <Link to={`/app/funcionarios/${emp.id}/historico`}>
                      <HistoryIcon className="h-3.5 w-3.5" />
                      Histórico
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteId(emp.id)}
                    className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* New employee */}
      <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo funcionário</DialogTitle>
            <DialogDescription>
              Crie um login para o operador. Você poderá compartilhar as credenciais ao final.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Maria Souza" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="maria"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={generatePassword}>
                    Gerar
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Permissões</Label>
              <PermissionsEditor value={perms} onChange={setPerms} />
            </div>

            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Acesso de Administrador</p>
                  <p className="text-xs text-muted-foreground">Pode editar/remover movimentações e gerenciar funcionários</p>
                </div>
                <Switch checked={isAdminNew} onCheckedChange={setIsAdminNew} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar funcionário</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar funcionário</DialogTitle>
            <DialogDescription>@{editing?.username}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Redefinir senha (opcional)</Label>
                <Input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Deixe em branco para manter"
                />
              </div>
              <div className="space-y-2">
                <Label>Permissões</Label>
                <PermissionsEditor value={editPerms} onChange={setEditPerms} />
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Acesso de Administrador</p>
                    <p className="text-xs text-muted-foreground">Pode editar/remover movimentações e gerenciar funcionários</p>
                  </div>
                  <Switch checked={editIsAdmin} onCheckedChange={(v) => setEditIsAdmin(v)} />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials sharing */}
      <Dialog open={!!credentialsModal} onOpenChange={(o) => !o && setCredentialsModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Credenciais criadas</DialogTitle>
            <DialogDescription>
              Compartilhe estas informações com o funcionário. Esta é a única vez que a senha
              será exibida em texto.
            </DialogDescription>
          </DialogHeader>
          {credentialsModal && (
            <div className="space-y-3">
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> <strong>{credentialsModal.name}</strong></div>
                <div><span className="text-muted-foreground">Link:</span> <code className="text-xs">{window.location.origin}/login</code></div>
                <div><span className="text-muted-foreground">Usuário:</span> <code className="font-mono">{credentialsModal.username}</code></div>
                <div><span className="text-muted-foreground">Senha:</span> <code className="font-mono">{credentialsModal.password}</code></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteText)
                    toast.success("Mensagem copiada")
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar mensagem
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const url = `https://wa.me/?text=${encodeURIComponent(inviteText)}`
                    window.open(url, "_blank")
                  }}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Enviar via WhatsApp
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentialsModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso será revogado imediatamente. O histórico de movimentações continuará
              registrado com o nome dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  removeEmployee(deleteId)
                  toast.success("Funcionário removido")
                }
                setDeleteId(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
