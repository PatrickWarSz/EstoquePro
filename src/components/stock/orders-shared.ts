import type { Order } from "@/lib/types"
import { pluralizeUnit } from "@/lib/units"

// ─── datas ───────────────────────────────────────────────────────────────────

export function fmtDate(iso?: string) {
  if (!iso) return "—"
  const datePart = String(iso).slice(0, 10)
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function todayYmd() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function dateInputValue(iso?: string) {
  return iso ? String(iso).slice(0, 10) : todayYmd()
}

export function dateInputToIso(date: string) {
  return `${date}T12:00:00.000Z`
}

export function daysBetween(fromYmd: string, toYmd: string) {
  const a = new Date(fromYmd + "T00:00:00Z").getTime()
  const b = new Date(toYmd + "T00:00:00Z").getTime()
  return Math.round((b - a) / 86400000)
}

export function getDeadlineStatus(expectedDate?: string, deliveryDate?: string): Order["deadlineStatus"] {
  const expected = expectedDate ? String(expectedDate).slice(0, 10) : ""
  const delivered = deliveryDate ? String(deliveryDate).slice(0, 10) : ""
  if (expected && delivered) return delivered <= expected ? "Entregue no Prazo" : "Entregue com Atraso"
  if (!expected) return "Dentro do Prazo"
  return todayYmd() > expected ? "Pedido Atrasado" : "Dentro do Prazo"
}

// ─── números ─────────────────────────────────────────────────────────────────

export function fmtCurrency(val: number) {
  return (Number.isFinite(val) ? val : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function fmtNum(val: number) {
  return (Number.isFinite(val) ? val : 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

export function shortUnit(unit?: string) {
  return pluralizeUnit(1, unit || "kg", { short: true }) || unit || "kg"
}

/** Aceita "1.008", "1.008,50", "42,90", "R$ 42,90", "0.0965". Retorna NaN se inválido. */
export function parseNum(v: string): number {
  let s = String(v ?? "").trim().replace(/R\$|\s/gi, "")
  if (!s) return NaN
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".")
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "")
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export const UNIT_SUGGESTIONS = ["kg", "rolo", "un", "m", "cx", "L"]

// ─── cores (sempre tokens do tema) ───────────────────────────────────────────

export type Tone = "destructive" | "warning" | "success" | "primary" | "muted"

export const TONE_SOFT: Record<Tone, string> = {
  destructive: "border-destructive/25 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/25 bg-success/10 text-success",
  primary: "border-primary/25 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
}

export const TONE_ACCENT: Record<Tone, string> = {
  destructive: "border-l-destructive",
  warning: "border-l-warning",
  success: "border-l-success",
  primary: "border-l-primary",
  muted: "border-l-border",
}

// ─── regras de pedido ────────────────────────────────────────────────────────

export const isOpen = (o: Order) => o.deliveryStatus === "Entrega Incompleta"

export function expectedYmd(o: Order) {
  return o.expectedDate ? String(o.expectedDate).slice(0, 10) : ""
}

/** Dias até a previsão (negativo = atrasado). null = sem previsão. */
export function daysToExpected(o: Order): number | null {
  const e = expectedYmd(o)
  return e ? daysBetween(todayYmd(), e) : null
}

export const isLate = (o: Order) => {
  if (!isOpen(o)) return false
  const d = daysToExpected(o)
  return d !== null && d < 0
}

export function orderMetrics(o: Order) {
  const ordered = Number(o.quantityOrdered) || 0
  const delivered = Number(o.quantityDelivered) || 0
  const price = Number(o.pricePerUnit) || 0
  const open = isOpen(o)
  const pending = open ? Math.max(0, ordered - delivered) : 0
  return {
    ordered,
    delivered,
    price,
    open,
    pending,
    excess: delivered > ordered ? delivered - ordered : 0,
    // pedido encerrado com menos do que foi pedido
    shortage: !open && delivered < ordered ? ordered - delivered : 0,
    value: ordered * price,
    pendingValue: pending * price,
  }
}

export function arrivalLabel(diff: number | null) {
  if (diff === null) return { label: "Sem previsão", tone: "muted" as Tone }
  if (diff < 0) {
    const d = Math.abs(diff)
    return { label: `Atrasado ${d} ${d === 1 ? "dia" : "dias"}`, tone: "destructive" as Tone }
  }
  if (diff === 0) return { label: "Chega hoje", tone: "warning" as Tone }
  if (diff === 1) return { label: "Chega amanhã", tone: "warning" as Tone }
  if (diff <= 7) return { label: `Chega em ${diff} dias`, tone: "warning" as Tone }
  return { label: `Chega em ${diff} dias`, tone: "primary" as Tone }
}

export type LineKind = "late" | "due" | "waiting" | "partial" | "done" | "excess" | "short"

export interface LineStatus {
  kind: LineKind
  label: string
  sub?: string
  tone: Tone
}

/** Situação de UM item do pedido — o que importa agora. */
export function lineStatus(o: Order): LineStatus {
  const m = orderMetrics(o)
  const unit = shortUnit(o.unit)
  const diff = daysToExpected(o)

  if (m.open) {
    const arrival = arrivalLabel(diff)
    if (m.delivered > 0) {
      return {
        kind: "partial",
        label: `Faltam ${fmtNum(m.pending)} ${unit}`,
        sub: diff === null ? "sem previsão" : arrival.label.toLowerCase(),
        tone: diff !== null && diff < 0 ? "destructive" : "warning",
      }
    }
    return {
      kind: diff !== null && diff < 0 ? "late" : diff !== null && diff <= 7 ? "due" : "waiting",
      label: arrival.label,
      sub: diff === null ? undefined : `previsto ${fmtDate(o.expectedDate)}`,
      tone: arrival.tone,
    }
  }

  if (m.excess > 0) {
    const pct = m.ordered > 0 ? (m.excess / m.ordered) * 100 : 0
    return {
      kind: "excess",
      label: `+${fmtNum(m.excess)} ${unit} a mais`,
      sub: m.ordered > 0 ? `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% acima do pedido` : undefined,
      tone: "muted",
    }
  }
  if (m.shortage > 0) {
    return {
      kind: "short",
      label: `Faltou ${fmtNum(m.shortage)} ${unit}`,
      sub: "pedido encerrado",
      tone: "muted",
    }
  }
  const late = getDeadlineStatus(o.expectedDate, o.deliveryDate) === "Entregue com Atraso"
  return {
    kind: "done",
    label: "Completo",
    sub: late ? "chegou com atraso" : o.deliveryDate ? `recebido ${fmtDate(o.deliveryDate)}` : undefined,
    tone: "success",
  }
}

// ─── agrupamento (uma compra = vários itens do mesmo fornecedor) ─────────────

export interface OrderGroup {
  key: string
  supplierId: string
  createdAt: string
  orders: Order[]
}

/**
 * Itens criados juntos no "Novo pedido" são gravados com o mesmo fornecedor e o
 * mesmo carimbo de data/hora — é assim que a tela junta eles numa compra só,
 * sem precisar mudar nada no banco.
 */
export function groupOrders(orders: Order[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>()
  for (const o of orders) {
    const key = `${o.supplierId}|${String(o.orderDate).slice(0, 19)}`
    const g = map.get(key)
    if (g) g.orders.push(o)
    else map.set(key, { key, supplierId: o.supplierId, createdAt: o.orderDate, orders: [o] })
  }
  const list = [...map.values()]
  list.forEach((g) =>
    g.orders.sort((a, b) => a.productDescription.localeCompare(b.productDescription, "pt-BR", { numeric: true }))
  )
  return list
}

export function groupInfo(g: OrderGroup) {
  const open = g.orders.filter(isOpen)
  const metrics = g.orders.map(orderMetrics)
  const late = open.filter(isLate)
  const nearest = open
    .map(expectedYmd)
    .filter(Boolean)
    .sort()[0]
  const units = new Set(g.orders.map((o) => shortUnit(o.unit)))
  return {
    open,
    late,
    nearest: nearest || "",
    excessCount: metrics.filter((m) => m.excess > 0).length,
    shortCount: metrics.filter((m) => m.shortage > 0).length,
    totalValue: metrics.reduce((s, m) => s + m.value, 0),
    pendingValue: metrics.reduce((s, m) => s + m.pendingValue, 0),
    totalQty: metrics.reduce((s, m) => s + m.ordered, 0),
    singleUnit: units.size === 1 ? [...units][0] : null,
  }
}

// ─── colar lista (Excel / texto) ─────────────────────────────────────────────

export interface PastedItem {
  description: string
  qty: string
  unit: string
  price: string
}

/**
 * Uma linha por item. Colunas separadas por TAB (colado do Excel) ou ";".
 * Primeira coluna = produto. Das demais: texto curto = unidade, números = quantidade e depois preço.
 * Também entende "1008 KG" numa célula só.
 */
export function parsePastedItems(text: string, defaultUnit = "kg"): PastedItem[] {
  const out: PastedItem[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cells = (line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : [line])
      .map((c) => c.trim())
      .filter(Boolean)
    if (cells.length === 0) continue
    const [first, ...rest] = cells
    if (/^(produto|descri)/i.test(first)) continue

    let unit = ""
    const nums: string[] = []
    for (const c of rest) {
      const combo = c.match(/^([\d.,]+)\s*([a-zA-Zç]{1,6})\.?$/)
      if (combo && !Number.isNaN(parseNum(combo[1]))) {
        nums.push(combo[1])
        if (!unit) unit = combo[2].toLowerCase()
      } else if (/^[a-zA-Zç]{1,6}\.?$/.test(c)) {
        if (!unit) unit = c.replace(".", "").toLowerCase()
      } else if (!Number.isNaN(parseNum(c))) {
        nums.push(c)
      }
    }
    out.push({ description: first, qty: nums[0] ?? "", unit: unit || defaultUnit, price: nums[1] ?? "" })
  }
  return out
}
