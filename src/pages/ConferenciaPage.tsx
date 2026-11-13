import { useEffect, useMemo, useState } from "react"
import { ClipboardCheck, Printer, CheckCheck, Save, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStockStore } from "@/lib/stock-store"
import { formatQuantity, pluralizeUnit } from "@/lib/units"
import { toast } from "sonner"

const DRAFT_KEY = "conferencia-draft-v1"

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
}

/** Aceita "1.500", "1500", "12,5", "1.234,56". */
export function parseCount(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s
  const n = Number(norm)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null
}

type Row = { key: string; catId: string; catName: string; itemId: string; name: string; qty: number; unit: string }

type Group<T> = { catId: string; catName: string; rows: T[] }

/** Agrupa mantendo a ordem de chegada, igual à folha impressa. */
function groupByCategory<T extends { catId: string; catName: string }>(list: T[]): Group<T>[] {
  const out: Group<T>[] = []
  const idx = new Map<string, number>()
  for (const it of list) {
    let i = idx.get(it.catId)
    if (i === undefined) { i = out.length; idx.set(it.catId, i); out.push({ catId: it.catId, catName: it.catName, rows: [] }) }
    out[i].rows.push(it)
  }
  return out
}

export default function ConferenciaPage() {
  const { categories, applyBatchMovements } = useStockStore()
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showQty, setShowQty] = useState(true)
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") } catch { return {} }
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(counts)) }, [counts])


  const rows: Row[] = useMemo(() => {
    const all: Row[] = []
    categories.forEach((c) => c.items.forEach((i) => {
      const key = `${c.id}:${i.id}`
      all.push({ key, catId: c.id, catName: c.name, itemId: i.id, name: i.name, qty: i.quantity, unit: i.unit || c.unit || "" })
    }))
    return all
  }, [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      (catFilter.size === 0 || catFilter.has(r.catId)) &&
      (!q || r.name.toLowerCase().includes(q)))
  }, [rows, catFilter, search])

  const toPrint = filtered.filter((r) => selected.size === 0 || selected.has(r.key))

  /** Numeração idêntica à da folha: 1, 2, 3... na ordem em que sai impressa. */
  const printNumbers = useMemo(() => {
    const m = new Map<string, number>()
    toPrint.forEach((r, i) => m.set(r.key, i + 1))
    return m
  }, [toPrint])

  const groups = useMemo(() => groupByCategory(filtered), [filtered])

  const toggleSet = (s: Set<string>, id: string, set: (v: Set<string>) => void) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); set(n)
  }

  const printSheet = () => {
    if (toPrint.length === 0) return toast.error("Nenhum item para imprimir")
    const w = window.open("", "_blank", "width=1000,height=800")
    if (!w) return toast.error("Bloqueio de pop-up. Permita pop-ups para imprimir.")
    const now = new Date().toLocaleString("pt-BR")
    let lastCat = ""
    let n = 0
    const body = toPrint.map((r) => {
      const head = r.catName !== lastCat ? `<tr class="cat"><td colspan="${showQty ? 4 : 3}">${esc(r.catName)}</td></tr>` : ""
      lastCat = r.catName
      n++
      return `${head}<tr>
        <td class="n">${n}</td>
        <td class="name">${esc(r.name)}</td>
        ${showQty ? `<td class="sys">${esc(formatQuantity(r.qty, r.unit))}</td>` : ""}
        <td class="real"><span class="u">${esc(pluralizeUnit(2, r.unit))}</span></td>
      </tr>`
    }).join("")
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Conferência de Estoque</title><style>
      @page { size: A4; margin: 12mm 10mm; }
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;margin:0;font-size:11pt}
      h1{font-size:16pt;margin:0 0 3mm} .meta{display:flex;gap:8mm;margin:0 0 5mm}
      .meta span{flex:1;border-bottom:1px solid #000;padding-bottom:1mm}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #444;padding:3mm 2mm;vertical-align:middle}
      th{background:#e5e5e5;font-size:9pt;text-transform:uppercase;text-align:left}
      thead{display:table-header-group} tr{page-break-inside:avoid}
      tr.cat td{background:#d9d9d9;font-weight:700;font-size:12pt;text-transform:uppercase}
      .n{width:9mm;text-align:center;color:#555;font-size:9pt}
      .name{font-weight:600;word-break:break-word}
      .sys{width:34mm;text-align:right;font-weight:700;white-space:nowrap}
      .real{width:45mm;height:11mm;text-align:right;vertical-align:bottom} .u{font-size:8pt;color:#666}
      .foot{margin-top:10mm;display:flex;gap:12mm} .foot span{flex:1;border-top:1px solid #000;padding-top:1mm;text-align:center;font-size:9pt}
    </style></head><body>
      <h1>Conferência de Estoque</h1>
      <div class="meta"><span>Responsável: </span><span style="flex:.5">Data: ___/___/______</span></div>
      <table><thead><tr><th>#</th><th>Produto</th>${showQty ? '<th style="text-align:right">Sistema</th>' : ""}<th>Contado</th></tr></thead>
      <tbody>${body}</tbody></table>
      <div class="foot"><span>Assinatura do conferente</span></div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script>
    </body></html>`)
    w.document.close()
  }

  const diffs = toPrint.map((r) => {
    const c = parseCount(counts[r.key] ?? "")
    return { r, c, diff: c === null ? null : Math.round((c - r.qty) * 1000) / 1000 }
  })
  const changed = diffs.filter((d) => d.diff !== null && d.diff !== 0)

  const markAllOk = () => {
    const n = { ...counts }
    toPrint.forEach((r) => { if (!n[r.key]) n[r.key] = String(r.qty).replace(".", ",") })
    setCounts(n)
  }

  const apply = async () => {
    if (changed.length === 0) return toast.info("Nenhuma divergência para ajustar")
    if (!confirm(`Ajustar ${changed.length} item(ns) no estoque? Isso fica registrado no histórico.`)) return
    setSaving(true)
    try {
      await applyBatchMovements(changed.map(({ r, c, diff }) => ({
        categoryId: r.catId, itemId: r.itemId, newQ: c!,
        type: diff! > 0 ? "entrada" : "saida", movQ: Math.abs(diff!),
        note: `Ajuste de inventário: de ${formatQuantity(r.qty, r.unit)} para ${formatQuantity(c!, r.unit)}`,
      })))
      const n = { ...counts }; toPrint.forEach((r) => delete n[r.key]); setCounts(n)
      toast.success(`${changed.length} item(ns) ajustado(s)`)
    } catch (e: any) {
      toast.error("Falha ao ajustar: " + (e?.message || "erro"))
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Conferência de Estoque</h1>
      </div>

      <Card className="space-y-3 p-4">
        <div><Label>Buscar produto</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do produto" /></div>
        <div>
          <Label>Categorias {catFilter.size === 0 && <span className="text-muted-foreground">(todas)</span>}</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button key={c.id} size="sm" variant={catFilter.has(c.id) ? "default" : "outline"} onClick={() => toggleSet(catFilter, c.id, setCatFilter)}>{c.name}</Button>
            ))}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="folha">
        <TabsList className="grid w-full grid-cols-2 md:w-auto">
          <TabsTrigger value="folha">1. Gerar folha</TabsTrigger>
          <TabsTrigger value="lancar">2. Lançar contagem</TabsTrigger>
        </TabsList>

        <TabsContent value="folha" className="space-y-3">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={showQty} onCheckedChange={(v) => setShowQty(!!v)} />Mostrar estoque do sistema na folha</label>
            <span className="text-sm text-muted-foreground">{selected.size === 0 ? `Todos os ${filtered.length} itens filtrados` : `${toPrint.length} selecionados`}</span>
            <div className="ml-auto flex gap-2">
              {selected.size > 0 && <Button variant="outline" onClick={() => setSelected(new Set())}>Limpar seleção</Button>}
              <Button onClick={printSheet}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
            </div>
          </Card>
          <Card className="divide-y">
            {filtered.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-start gap-3 p-3">
                <Checkbox className="mt-1" checked={selected.has(r.key)} onCheckedChange={() => toggleSet(selected, r.key, setSelected)} />
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.catName}</div>
                </div>
                <div className="whitespace-nowrap font-semibold tabular-nums">{formatQuantity(r.qty, r.unit)}</div>
              </label>
            ))}
            {filtered.length === 0 && <p className="p-6 text-center text-muted-foreground">Nenhum item encontrado</p>}
          </Card>
        </TabsContent>

        <TabsContent value="lancar" className="space-y-3">
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-sm text-muted-foreground">Digite o que foi contado. Deixe em branco o que não foi conferido. O rascunho fica salvo neste aparelho.</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" onClick={markAllOk}><CheckCheck className="mr-2 h-4 w-4" />Vazios = bateu</Button>
              <Button variant="outline" onClick={() => { const n = { ...counts }; toPrint.forEach((r) => delete n[r.key]); setCounts(n) }}><RotateCcw className="mr-2 h-4 w-4" />Limpar</Button>
              <Button onClick={apply} disabled={saving || changed.length === 0}><Save className="mr-2 h-4 w-4" />Ajustar {changed.length} divergência(s)</Button>
            </div>
          </Card>
          <Card className="divide-y">
            {diffs.map(({ r, diff }) => (
              <div key={r.key} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="break-words font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.catName} · Sistema: {formatQuantity(r.qty, r.unit)}</div>
                </div>
                <Input inputMode="decimal" className="w-28" placeholder="Contado" value={counts[r.key] ?? ""} onChange={(e) => setCounts({ ...counts, [r.key]: e.target.value })} />
                <div className={`w-28 text-right text-sm font-semibold tabular-nums ${diff === null ? "text-muted-foreground" : diff === 0 ? "text-primary" : "text-destructive"}`}>
                  {diff === null ? "—" : diff === 0 ? "Bateu" : `${diff > 0 ? "+" : ""}${formatQuantity(diff, r.unit)}`}
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
