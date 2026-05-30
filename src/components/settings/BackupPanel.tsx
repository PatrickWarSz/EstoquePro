import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthStore } from "@/lib/auth-store"
import { toast } from "sonner"
import {
  DatabaseBackup,
  Download,
  RotateCcw,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  Clock,
  HardDrive,
} from "lucide-react"

interface BackupLog {
  id: string
  workspace_id: string
  storage_path: string
  tamanho_bytes: number
  status: "ok" | "erro"
  erro_msg?: string
  criado_em: string
  // Metadados do arquivo (preenchidos ao carregar a lista)
  _meta?: {
    totais?: {
      produtos: number
      movimentacoes: number
      pedidos: number
      categorias: number
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BackupPanel() {
  const { workspaceId, backupWorkspace, restoreBackup } = useAuthStore()

  const [backups, setBackups] = useState<BackupLog[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Restauração
  const [restoreTarget, setRestoreTarget] = useState<BackupLog | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [loadingRestore, setLoadingRestore] = useState(false)

  const fetchBackups = useCallback(async () => {
    if (!workspaceId) return
    setLoadingList(true)
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data } = await supabase
        .from("backup_logs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "ok")
        .order("criado_em", { ascending: false })
        .limit(7)
      setBackups(data || [])
    } catch {
      toast.error("Erro ao carregar lista de backups.")
    } finally {
      setLoadingList(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  const handleBackupNow = async () => {
    setLoadingBackup(true)
    const toastId = toast.loading("Criando backup, aguarde...")
    try {
      const result = await backupWorkspace()
      toast.dismiss(toastId)
      if (result.ok) {
        toast.success("Backup criado com sucesso!")
        await fetchBackups()
      } else {
        toast.error(result.error || "Falha ao criar backup.")
      }
    } catch {
      toast.dismiss(toastId)
      toast.error("Erro inesperado ao criar backup.")
    } finally {
      setLoadingBackup(false)
    }
  }

  const handleDownload = async (backup: BackupLog) => {
    setDownloadingId(backup.id)
    try {
      const { supabase } = await import("@/lib/supabase")
      // URL assinada válida por 60 segundos — só quem está logado acessa
      const { data, error } = await supabase.storage
        .from("backups")
        .createSignedUrl(backup.storage_path, 60)

      if (error || !data?.signedUrl) throw new Error("Não foi possível gerar o link.")

      // Forçar download via link temporário
      const a = document.createElement("a")
      a.href = data.signedUrl
      a.download = `vexo-backup-${new Date(backup.criado_em).toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar backup.")
    } finally {
      setDownloadingId(null)
    }
  }

  const handleRestoreConfirm = async () => {
    if (!restoreTarget || confirmText !== "CONFIRMAR") return

    setLoadingRestore(true)
    const toastId = toast.loading("Restaurando dados, não feche o programa...")
    try {
      const result = await restoreBackup(restoreTarget.id)
      toast.dismiss(toastId)
      if (result.ok) {
        toast.success("Dados restaurados com sucesso! A página será recarregada.")
        setRestoreTarget(null)
        setConfirmText("")
        // Recarregar o app para refletir os dados restaurados
        setTimeout(() => window.location.reload(), 1500)
      } else {
        toast.error(result.error || "Falha na restauração.")
      }
    } catch {
      toast.dismiss(toastId)
      toast.error("Erro inesperado durante a restauração.")
    } finally {
      setLoadingRestore(false)
    }
  }

  const lastBackup = backups[0]

  return (
    <>
      <Card className="p-5 space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Backup de Dados</p>
              <p className="text-xs text-muted-foreground">
                {lastBackup
                  ? `Último backup: ${formatDate(lastBackup.criado_em)}`
                  : "Nenhum backup realizado ainda"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleBackupNow}
            disabled={loadingBackup}
            className="shrink-0"
          >
            {loadingBackup ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</>
            ) : (
              <><DatabaseBackup className="h-4 w-4 mr-2" />Fazer backup agora</>
            )}
          </Button>
        </div>

        {/* Lista de backups */}
        {loadingList ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed rounded-lg">
            <DatabaseBackup className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum backup encontrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Clique em "Fazer backup agora" ou aguarde o backup automático diário
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Últimos {backups.length} backup{backups.length > 1 ? "s" : ""} · máximo 7
            </p>
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {backups.map((backup, idx) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-background hover:bg-muted/30 transition-colors"
                >
                  {/* Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {idx === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {formatDate(backup.criado_em)}
                        {idx === 0 && (
                          <span className="ml-2 text-xs text-green-600 font-normal">
                            mais recente
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {formatBytes(backup.tamanho_bytes)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(backup)}
                      disabled={downloadingId === backup.id}
                      title="Baixar backup"
                    >
                      {downloadingId === backup.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRestoreTarget(backup)
                        setConfirmText("")
                      }}
                      title="Restaurar para este backup"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé informativo */}
        <p className="text-xs text-muted-foreground">
          Backups automáticos são gerados diariamente às 03h. Os 7 mais recentes são mantidos.
        </p>
      </Card>

      {/* Dialog de confirmação de restauração */}
      <Dialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open && !loadingRestore) {
            setRestoreTarget(null)
            setConfirmText("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Restaurar dados
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                Você está prestes a restaurar os dados para o estado de:
              </span>
              <span className="block font-medium text-foreground">
                {restoreTarget && formatDate(restoreTarget.criado_em)}
              </span>
              <span className="block text-destructive font-medium">
                ⚠ Todos os dados atuais serão substituídos pelos dados deste backup.
                Esta ação não pode ser desfeita.
              </span>
              <span className="block">
                Para confirmar, digite <strong>CONFIRMAR</strong> no campo abaixo:
              </span>
            </DialogDescription>
          </DialogHeader>

          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="Digite CONFIRMAR"
            disabled={loadingRestore}
            className="font-mono"
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRestoreTarget(null)
                setConfirmText("")
              }}
              disabled={loadingRestore}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestoreConfirm}
              disabled={confirmText !== "CONFIRMAR" || loadingRestore}
            >
              {loadingRestore ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restaurando...</>
              ) : (
                <><RotateCcw className="h-4 w-4 mr-2" />Restaurar agora</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}