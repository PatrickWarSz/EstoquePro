import { supabase } from "./supabase"

export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  "BL1aKr98OwRwN1KM__AkmNADql4InfSNnEiayTVBy-1c0Gf-Wo_LjOt917-FA7vnoU7p-3a34050tegAGmIYYnY"

const SW_URL = "/push-sw.js"
const DEVICE_KEY = "estoque.push.deviceId.v1"

export function pushSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/** iOS Safari só aceita Push quando o app já foi adicionado à tela inicial (standalone). */
export function iosStandaloneRequired(): boolean {
  if (typeof window === "undefined") return false
  const ua = navigator.userAgent || ""
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  if (!isIOS) return false
  // @ts-ignore
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone
  return !standalone
}

export function currentPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported"
  return Notification.permission
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return "device-" + Date.now()
  }
}

function deviceLabel(): string {
  const ua = navigator.userAgent || ""
  if (/iPhone/i.test(ua)) return "iPhone"
  if (/iPad/i.test(ua)) return "iPad"
  if (/Android/i.test(ua)) return "Android"
  if (/Macintosh/i.test(ua)) return "Mac"
  if (/Windows/i.test(ua)) return "Windows"
  if (/Linux/i.test(ua)) return "Linux"
  return "Dispositivo"
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL)
  if (existing) return existing
  return navigator.serviceWorker.register(SW_URL, { scope: "/" })
}

export async function ensureSubscribed(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" }
  if (iosStandaloneRequired()) return { ok: false, reason: "ios-add-to-home" }

  let perm = Notification.permission
  if (perm === "default") perm = await Notification.requestPermission()
  if (perm !== "granted") return { ok: false, reason: "denied" }

  const reg = await registerSW()
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    })
  }

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, reason: "no-session" }

  const { error } = await supabase.functions.invoke("push-subscribe", {
    body: {
      action: "subscribe",
      deviceId: deviceId(),
      deviceLabel: deviceLabel(),
      subscription: sub.toJSON(),
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) return { ok: false, reason: error.message || "backend-error" }
  return { ok: true }
}

export async function unsubscribeCurrent(): Promise<void> {
  try {
    if (!pushSupported()) return
    const reg = await navigator.serviceWorker.getRegistration(SW_URL)
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      await supabase.functions.invoke("push-subscribe", {
        body: { action: "unsubscribe", deviceId: deviceId() },
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch (e) {
    console.warn("[push.unsubscribeCurrent]", e)
  }
}

export async function listMyDevices(): Promise<Array<{ id: string; device_id: string; device_label: string; created_at: string }>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return []
  const { data, error } = await supabase.functions.invoke("push-subscribe", {
    body: { action: "list" },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) return []
  return (data as any)?.data || []
}

export async function removeDevice(id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return
  await supabase.functions.invoke("push-subscribe", {
    body: { action: "remove", id },
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function currentDeviceId(): string {
  return deviceId()
}

/** Dispara verificação de estoque e envia notificações aos inscritos do workspace. */
export async function triggerStockAlertCheck(itemId: string, prevQty: number, newQty: number): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    await supabase.functions.invoke("push-notify", {
      body: { action: "stock_check", itemId, prevQty, newQty },
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (e) {
    // Silencioso — alertas não devem quebrar operação
    console.warn("[push.triggerStockAlertCheck]", e)
  }
}