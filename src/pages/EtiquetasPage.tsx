import { useMemo, useState } from "react"
import { Plus, Printer, QrCode, MapPin, Trash2, Edit3, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useStockStore } from "@/lib/stock-store"
import { encodeItemQr, encodeLocationQr } from "@/lib/qr"
import { QrImage } from "@/components/qr/qr-image"
import { toast } from "sonner"
import QRCode from "qrcode"
import type { StockLocation } from "@/lib/types"

interface PrintItem {
  title: string
  subtitle: string
  payload: string
}

async function openPrintWindow(items: PrintItem[]) {
  if (items.length === 0) {
    toast.error("Selecione ao menos um item")
    return
  }
  // Pre-generate QR codes as data URLs so the print window doesn't depend on a CDN
  const withQr = await Promise.all(
    items.map(async (it) => ({
      ...it,
      dataUrl: await QRCode.toDataURL(it.payload, {
        width: 600,
        margin: 1,
        errorCorrectionLevel: "M",
      }),
    })),
  )
  const w = window.open("", "_blank", "width=900,height=700")
  if (!w) return toast.error("Bloqueio de pop-up. Permita pop-ups para imprimir.")
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas QR</title>
<style>
  *{box-sizing:border-box}
  @page { size: 100mm 150mm; margin: 0; }
  html, body { margin: 0; padding: 0; background:#fff; color:#000;
    font-family:-apple-system,Segoe UI,Roboto,sans-serif; }
  .label{
    width:100mm; height:150mm;
    padding:6mm;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; gap:4mm;
    page-break-after: always; break-after: page;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .label img { width:70mm; height:70mm; display:block; }
  .label .title { font-weight:700; font-size:14pt; line-height:1.2; margin:0;
    word-break: break-word; max-width:90mm; }
  .label .subtitle { font-size:10pt; color:#333; margin:0; max-width:90mm; }
  @media screen { body { padding:12mm; background:#eee; }
    .label { background:#fff; margin:6mm auto; box-shadow:0 1px 6px rgba(0,0,0,.15); } }
</style></head><body>
${withQr
  .map(
    (it) => `<div class="label">
  <img src="${it.dataUrl}" alt="QR" />
  <p class="title">${it.title}</p>
  <p class="subtitle">${it.subtitle}</p>
</div>`,
  )
  .join("")}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script>
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}

export default function EtiquetasPage() {
  const {
    categories,
    locations,
    addLocation,
    updateLocation,
    removeLocation,
    toggleLocationItem,
  } = useStockStore()

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectedLocs, setSelectedLocs] = useState<Set<string>>(new Set())
  const [editLoc, setEditLoc] = useState<StockLocation | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const allItems = useMemo(
    () =>
      categories.flatMap((c) =>
        c.items.map((i) => ({ catId: c.id, catName: c.name, item: i })),
      ),
    [categories],
  )

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const ns = new Set(set)
    ns.has(id) ? ns.delete(id) : ns.add(id)
    setter(ns)
  }

  const printItems = () => {
    const items: PrintItem[] = allItems
      .filter(({ catId, item }) => selectedItems.has(`${catId}:${item.id}`))
      .map(({ catName, item, catId }) => ({
        title: item.name,
        subtitle: `${catName} • ${item.unit}`,
        payload: encodeItemQr(catId, item.id),
      }))
    openPrintWindow(items)
  }

  const printLocations = () => {
    const items: PrintItem[] = locations
      .filter((l) => selectedLocs.has(l.id))
      .map((l) => ({
        title: l.name,
        subtitle: l.description || `${l.itemRefs.length} item(ns)`,
        payload: encodeLocationQr(l.id),
      }))
    openPrintWindow(items)
  }

  const handleAddLocation = async () => {
    if (!newName.trim()) return toast.error("Informe um nome")
    await addLocation({ name: newName.trim(), description: newDesc.trim() || undefined })
    setNewName("")
    setNewDesc("")
    setOpenNew(false)
    toast.success("Local criado")
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <QrCode className="h-6 w-6 text-primary" />
          Etiquetas QR
        </h2>
        <p className="text-sm text-muted-foreground">
          Gere e imprima etiquetas para colar nos itens, caixas e prateleiras.
        </p>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList>
          <TabsTrigger value="items">
            <Package className="mr-2 h-4 w-4" /> Itens do estoque
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="mr-2 h-4 w-4" /> Prateleiras / Locais
          </TabsTrigger>
        </TabsList>

        {/* ── ITEMS ─────────────────────────────────────────── */}
        <TabsContent value="items" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedItems.size} selecionado(s)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectedItems(
                    new Set(allItems.map(({ catId, item }) => `${catId}:${item.id}`)),
                  )
                }
              >
                Selecionar todos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>
                Limpar
              </Button>
              <Button size="sm" onClick={printItems}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir ({selectedItems.size})
              </Button>
            </div>
          </div>

          {allItems.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Nenhum item cadastrado. Adicione itens em <strong>Estoque</strong>.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allItems.map(({ catId, catName, item }) => {
                const ref = `${catId}:${item.id}`
                const checked = selectedItems.has(ref)
                return (
                  <Card
                    key={ref}
                    className={`flex items-center gap-3 p-3 transition ${
                      checked ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(selectedItems, ref, setSelectedItems)}
                    />
                    <div className="rounded-md border bg-white p-1">
                      <QrImage value={encodeItemQr(catId, item.id)} size={64} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {catName} • {item.unit}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── LOCATIONS ─────────────────────────────────────── */}
        <TabsContent value="locations" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedLocs.size} selecionado(s)
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenNew(true)}>
                <Plus className="mr-2 h-4 w-4" /> Novo local
              </Button>
              <Button size="sm" onClick={printLocations}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir ({selectedLocs.size})
              </Button>
            </div>
          </div>

          {locations.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma prateleira cadastrada. Crie uma em "Novo local".
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map((l) => {
                const checked = selectedLocs.has(l.id)
                return (
                  <Card
                    key={l.id}
                    className={`flex flex-col gap-3 p-4 transition ${
                      checked ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(selectedLocs, l.id, setSelectedLocs)}
                      />
                      <div className="rounded-md border bg-white p-1">
                        <QrImage value={encodeLocationQr(l.id)} size={72} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{l.name}</div>
                        {l.description && (
                          <div className="truncate text-xs text-muted-foreground">
                            {l.description}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {l.itemRefs.length} item(ns) vinculado(s)
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditLoc(l)}>
                        <Edit3 className="mr-2 h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Remover "${l.name}"?`)) {
                            removeLocation(l.id)
                            toast.success("Local removido")
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New location dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova prateleira / local</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Prateleira A — Suplex"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddLocation}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit location: link items */}
      <Dialog open={!!editLoc} onOpenChange={(o) => !o && setEditLoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar local — {editLoc?.name}</DialogTitle>
          </DialogHeader>
          {editLoc && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    defaultValue={editLoc.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      updateLocation(editLoc.id, { name: e.target.value.trim() })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    defaultValue={editLoc.description || ""}
                    onBlur={(e) =>
                      updateLocation(editLoc.id, { description: e.target.value.trim() })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Itens nesta prateleira
                </Label>
                <div className="mt-2 max-h-[40vh] space-y-1 overflow-y-auto rounded-md border p-2">
                  {allItems.map(({ catId, catName, item }) => {
                    const ref = `${catId}:${item.id}`
                    const linked = locations.find((l) => l.id === editLoc.id)?.itemRefs.includes(ref)
                    return (
                      <label
                        key={ref}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={!!linked}
                          onCheckedChange={() => toggleLocationItem(editLoc.id, ref)}
                        />
                        <span className="flex-1">{item.name}</span>
                        <span className="text-xs text-muted-foreground">{catName}</span>
                      </label>
                    )
                  })}
                  {allItems.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      Nenhum item no estoque ainda.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEditLoc(null)}>Pronto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
