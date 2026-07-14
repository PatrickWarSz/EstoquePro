import { useEffect, useState } from "react"
import { Bell, BellOff, Trash2, Loader2, Smartphone, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  pushSupported,
  currentPermission,
  ensureSubscribed,
  unsubscribeCurrent,
  listMyDevices,
  removeDevice,
  currentDeviceId,
  iosStandaloneRequired,
} from "@/lib/push"
import { supabase } from "@/lib/supabase"

type Device = { id: string; device_id: string; device_label: string; created_at: string }

export function NotificationsPanel() {
  const [supported] = useState(pushSupported())
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(currentPermission())
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const needsIOSInstall = iosStandaloneRequired()
  const thisDevice = currentDeviceId()

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await listMyDevices()
      setDevices(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const res = await ensureSubscribed()
      if (!res.ok) {
        if (res.reason === "denied") toast.error("Permissão negada. Ative nas configurações do navegador.")
        else if (res.reason === "ios-add-to-home") toast.error("No iPhone, adicione o app à tela inicial antes de ativar.")
        else if (res.reason === "unsupported") toast.error("Este navegador não suporta notificações.")
        else toast.error("Não foi possível ativar as notificações.")
      } else {
        toast.success("Notificações ativadas neste dispositivo.")
        setPermission(Notification.permission)
        await refresh()
      }
    } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await unsubscribeCurrent()
      toast.success("Notificações desativadas neste dispositivo.")
      await refresh()
    } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    if (!confirm("Remover este dispositivo das notificações?")) return
    await removeDevice(id)
    toast.success("Dispositivo removido.")
    await refresh()
  }

  const sendTest = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const { error } = await supabase.functions.invoke("push-notify", {
        body: { action: "test" },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) toast.error("Falha no envio de teste.")
      else toast.success("Notificação de teste enviada.")
    } catch { toast.error("Falha no envio de teste.") }
  }

  const isSubscribedHere = devices.some((d) => d.device_id === thisDevice)

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Notificações de estoque</p>
          <p className="text-xs text-muted-foreground">
            Receba alertas no celular quando um item atingir o estoque mínimo ou zerar. Ative em cada dispositivo que quiser ser avisado.
          </p>
        </div>
      </div>

      {!supported ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Este navegador não suporta notificações push.
        </div>
      ) : needsIOSInstall ? (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
          <strong>iPhone/iPad:</strong> abra o app pelo Safari, toque em <em>Compartilhar → Adicionar à Tela de Início</em> e abra o app pelo ícone. Só depois será possível ativar as notificações.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isSubscribedHere ? (
            <>
              <Button variant="outline" size="sm" onClick={disable} disabled={busy} className="gap-2">
                <BellOff className="h-4 w-4" /> Desativar neste dispositivo
              </Button>
              <Button size="sm" variant="secondary" onClick={sendTest} className="gap-2">
                <Bell className="h-4 w-4" /> Enviar teste
              </Button>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ativo neste dispositivo
              </span>
            </>
          ) : (
            <Button size="sm" onClick={enable} disabled={busy || permission === "denied"} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Ativar neste dispositivo
            </Button>
          )}
          {permission === "denied" && (
            <span className="text-xs text-destructive self-center">
              Permissão bloqueada no navegador — libere manualmente nas configurações do site.
            </span>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Meus dispositivos</p>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum dispositivo registrado ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{d.device_label}</span>
                  {d.device_id === thisDevice && (
                    <span className="text-[10px] uppercase tracking-wider text-primary">Este</span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}