import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  Link2,
  Undo2,
  MapPin,
  Package,
  ScanLine,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { useStockStore } from "@/lib/stock-store"
import { parseQr, qrKey } from "@/lib/qr"
import { beep } from "@/lib/beep"
import type { StockItem } from "@/lib/types"
import { toast } from "sonner"

interface SelectedItem {
  categoryId: string
  item: StockItem
}

interface BatchRow {
  categoryId: string
  categoryName: string
  item: StockItem
  qty: string
  type: "entrada" | "saida"
}

// One reversible movement (single or batch). Stored only in memory: persists
// while the page/scanner stays open, which is exactly the safety window we want.
interface UndoEntry {
  label: string
  changes: Array<{
    categoryId: string
    itemId: string
    itemName: string
    unit: string
    delta: number // signed: +entrada, -saida
    previousQty: number
  }>
}

export default function ScannerPage() {
  const containerId = "qr-reader-container"
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const continuousRef = useRef(true)

  const {
  categories,
  locations,
  updateItemQuantity,
  qrAliases,
  setQrAlias,
  initialize,
} = useStockStore()

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [movementType, setMovementType] = useState<"entrada" | "saida">("saida")
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")

  // Batch (shelf / location) state
  const [batchLocationId, setBatchLocationId] = useState<string | null>(null)
  const [batchType, setBatchType] = useState<"entrada" | "saida">("saida")
  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const [batchNote, setBatchNote] = useState("")

  // Confirmation summary + Undo
  const [summary, setSummary] = useState<null | {
  kind: "single" | "batch"
  title: string
  type: "entrada" | "saida"
  rows: Array<{
    itemName: string
    unit: string
    qty: number
    previous: number
    next: number
    type?: "entrada" | "saida"
  }>
}>(null)
  const [lastUndo, setLastUndo] = useState<UndoEntry | null>(null)

  // Unknown QR — offer to bind it (alias) to an existing item/location
  const [unknownPayload, setUnknownPayload] = useState<null | {
    kind: "item" | "location"
    key: string
    raw: string
  }>(null)

  const getVideoTrack = (): MediaStreamTrack | null => {
    const video = document.querySelector(
      `#${containerId} video`,
    ) as HTMLVideoElement | null
    const stream = video?.srcObject as MediaStream | null
    return stream?.getVideoTracks?.()[0] ?? null
  }

  const detectTorchSupport = () => {
    const track = getVideoTrack()
    const caps = (track?.getCapabilities?.() as { torch?: boolean } | undefined)
    const supported = !!caps?.torch
    setTorchSupported(supported)
    if (!supported) {
      setTimeout(() => {
        const t = getVideoTrack()
        const c = (t?.getCapabilities?.() as { torch?: boolean } | undefined)
        setTorchSupported(!!c?.torch)
      }, 1500)
    }
  }

  const toggleTorch = async () => {
    const track = getVideoTrack()
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({
        // @ts-expect-error torch is a non-standard constraint
        advanced: [{ torch: next }],
      })
      setTorchOn(next)
    } catch {
      toast.error("Não foi possível ativar a lanterna neste dispositivo")
      setTorchSupported(false)
    }
  }

  const stopScanner = async () => {
    const s = scannerRef.current
    setTorchOn(false)
    setTorchSupported(false)
    if (!s) return
    try {
      if (s.isScanning) await s.stop()
      await s.clear()
    } catch (_) {}
    scannerRef.current = null
    setScanning(false)
  }

  // Pause scanning while a sheet is open, but keep the camera "armed" so
  // continuous mode can resume instantly without re-prompting permission.
  const pauseScanner = async () => {
    const s = scannerRef.current
    if (!s) return
    try {
      if (s.isScanning) await s.stop()
    } catch {}
  }

  const handleDecoded = async (text: string) => {
    if (text === lastText) return
    setLastText(text)

    let payload = parseQr(text)
    // Allow re-routing a damaged/old QR via alias map
    if (payload) {
      const alias = qrAliases[qrKey(payload)]
      if (alias) {
        payload =
          alias.kind === "item"
            ? { kind: "item", categoryId: alias.categoryId, itemId: alias.itemId }
            : { kind: "location", locationId: alias.locationId }
      }
    }
    if (!payload) {
      if (soundOn) beep("error")
      toast.error("QR Code não reconhecido ou corrompido")
      // Offer to bind this raw code to something existing.
      setUnknownPayload({ kind: "item", key: text.trim(), raw: text.trim() })
      await pauseScanner()
      return
    }

    if (soundOn) beep("scan")
    await pauseScanner()

    if (payload.kind === "item") {
      const cat = categories.find((c) => c.id === payload.categoryId)
      const item = cat?.items.find((i) => i.id === payload.itemId)
      if (!item || !cat) {
        if (soundOn) beep("error")
        toast.error("Item vinculado ao QR não existe mais")
        setUnknownPayload({ kind: "item", key: qrKey(payload), raw: text.trim() })
        return
      }
      setSelectedItem({ categoryId: cat.id, item })
    } else {
      const loc = locations.find((l) => l.id === payload.locationId)
      if (!loc) {
        if (soundOn) beep("error")
        toast.error("Local vinculado ao QR não existe mais")
        setUnknownPayload({ kind: "location", key: qrKey(payload), raw: text.trim() })
        return
      }
      if (loc.itemRefs.length === 0) {
        toast.error("Este local ainda não tem itens vinculados")
        resumeIfContinuous()
        return
      }
      const rows: BatchRow[] = loc.itemRefs
        .map((ref) => {
          const [catId, itemId] = ref.split(":")
          const cat = categories.find((c) => c.id === catId)
          const item = cat?.items.find((i) => i.id === itemId)
          if (!cat || !item) return null
          return {
  categoryId: cat.id,
  categoryName: cat.name,
  item,
  qty: "",
  type: "saida",
} as BatchRow
        })
        .filter(Boolean) as BatchRow[]
      setBatchRows(rows)
      setBatchType("saida")
      setBatchNote("")
      setBatchLocationId(loc.id)
    }
  }

  const toggleRowType = (idx: number) => {
  setBatchRows((rows) =>
    rows.map((r, i) => i === idx ? { ...r, type: r.type === "saida" ? "entrada" : "saida" } : r)
  )
}

  const startScanner = async () => {
    setError(null)
    setLastText(null)
    try {
      const instance = new Html5Qrcode(containerId, { verbose: false })
      scannerRef.current = instance
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => handleDecoded(decoded),
        () => {},
      )
      setScanning(true)
      // Wait a tick for the video track to be live, then probe torch capability
      setTimeout(detectTorchSupport, 800)
    } catch (e: any) {
      setError(
        e?.message ||
          "Não foi possível acessar a câmera. Verifique as permissões do navegador.",
      )
      setScanning(false)
    }
  }

  // Resume an existing scanner instance (no permission re-prompt).
  const resumeScanner = async () => {
    const s = scannerRef.current
    if (!s) {
      // Nothing to resume — start fresh
      await startScanner()
      return
    }
    try {
      setLastText(null)
      await s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => handleDecoded(decoded),
        () => {},
      )
      setScanning(true)
      setTimeout(detectTorchSupport, 800)
    } catch {
      await startScanner()
    }
  }

  const resumeIfContinuous = () => {
    setTimeout(() => { resumeScanner() }, 300)
  }

  useEffect(() => {
  initialize()
  return () => {
    stopScanner()
  }
}, [])

  const closeSheet = () => {
    setSelectedItem(null)
    setQty("")
    setNote("")
  }

  const reviewMovement = () => {
    if (!selectedItem) return
    const n = parseFloat(qty)
    if (isNaN(n) || n <= 0) {
      toast.error("Quantidade inválida")
      return
    }
    if (movementType === "saida" && n > selectedItem.item.quantity) {
      toast.error("Quantidade maior que o saldo")
      return
    }
    const next =
      movementType === "entrada"
        ? selectedItem.item.quantity + n
        : selectedItem.item.quantity - n
    setSummary({
      kind: "single",
      title: selectedItem.item.name,
      type: movementType,
      rows: [
        {
          itemName: selectedItem.item.name,
          unit: selectedItem.item.unit,
          qty: n,
          previous: selectedItem.item.quantity,
          next,
        },
      ],
    })
  }

  const closeBatch = () => {
    setBatchLocationId(null)
    setBatchRows([])
    setBatchNote("")
  }

  const updateBatchQty = (idx: number, value: string) => {
    setBatchRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, qty: value } : r)),
    )
  }

  const reviewBatch = () => {
  // Sincroniza todos os tipos com batchType antes de revisar
  const syncedRows = batchRows.map((r) => ({ ...r, type: batchType }))
  const toApply = syncedRows
    .map((r) => ({ row: r, n: parseFloat(r.qty) }))
    .filter(({ n }) => !isNaN(n) && n > 0)

  if (toApply.length === 0) {
    toast.error("Informe a quantidade em pelo menos um item")
    return
  }

  const insufficient = toApply.find(
    ({ row, n }) => row.type === "saida" && n > row.item.quantity,
  )
  if (insufficient) {
    toast.error(`Saldo insuficiente em "${insufficient.row.item.name}"`)
    return
  }

  const loc = locations.find((l) => l.id === batchLocationId)
  setSummary({
    kind: "batch",
    title: loc?.name || "Lote",
    type: batchType,
    rows: toApply.map(({ row, n }) => ({
      itemName: row.item.name,
      unit: row.item.unit,
      qty: n,
      previous: row.item.quantity,
      next: row.type === "entrada" ? row.item.quantity + n : row.item.quantity - n,
      type: row.type,
    })),
  })
}

  const applySummary = () => {
    if (!summary) return
    const undo: UndoEntry = {
      label:
        summary.kind === "batch"
          ? `${summary.title} — ${summary.rows.length} item(ns)`
          : summary.title,
      changes: [],
    }

    if (summary.kind === "single" && selectedItem) {
      const r = summary.rows[0]
      updateItemQuantity(
        selectedItem.categoryId,
        selectedItem.item.id,
        r.next,
        summary.type,
        r.qty,
        note.trim() || undefined,
      )
      undo.changes.push({
        categoryId: selectedItem.categoryId,
        itemId: selectedItem.item.id,
        itemName: r.itemName,
        unit: r.unit,
        delta: summary.type === "entrada" ? r.qty : -r.qty,
        previousQty: r.previous,
      })
      closeSheet()
    } else if (summary.kind === "batch") {
      // Aplica todos os itens preenchidos com o tipo sincronizado do batchType
      const filled = batchRows
        .map((r) => ({ row: r, n: parseFloat(r.qty) }))
        .filter(({ n }) => !isNaN(n) && n > 0)
      filled.forEach(({ row, n }) => {
  const next = batchType === "entrada" ? row.item.quantity + n : row.item.quantity - n
  updateItemQuantity(
    row.categoryId,
    row.item.id,
    next,
    batchType,
    n,
    batchNote.trim() || undefined,
  )
        undo.changes.push({
          categoryId: row.categoryId,
          itemId: row.item.id,
          itemName: row.item.name,
          unit: row.item.unit,
          delta: batchType === "entrada" ? n : -n,
          previousQty: row.item.quantity,
        })
      })
      closeBatch()
    }

    setLastUndo(undo)
    if (soundOn) beep("success")
    toast.success(
      summary.kind === "batch"
        ? `${undo.changes.length} movimentação(ões) registrada(s)`
        : `${summary.type === "entrada" ? "Entrada" : "Saída"} registrada`,
    )
    setSummary(null)
    resumeIfContinuous()
  }

  const undoLast = () => {
    if (!lastUndo) return
    lastUndo.changes.forEach((c) => {
      // Reverse: restore previous quantity, log the inverse movement
      const reverseType: "entrada" | "saida" =
        c.delta >= 0 ? "saida" : "entrada"
      updateItemQuantity(
        c.categoryId,
        c.itemId,
        c.previousQty,
        reverseType,
        Math.abs(c.delta),
        "Estorno do último lançamento",
      )
    })
    if (soundOn) beep("success")
    toast.success(`Lançamento revertido (${lastUndo.changes.length} item(ns))`)
    setLastUndo(null)
  }

  // ── Bind unknown QR to an existing item/location ───────────
  const [bindCategoryId, setBindCategoryId] = useState("")
  const [bindItemId, setBindItemId] = useState("")
  const [bindLocationId, setBindLocationId] = useState("")

  const confirmBind = () => {
    if (!unknownPayload) return
    if (unknownPayload.kind === "item") {
      if (!bindCategoryId || !bindItemId) {
        toast.error("Selecione categoria e item")
        return
      }
      setQrAlias(unknownPayload.key, {
        kind: "item",
        categoryId: bindCategoryId,
        itemId: bindItemId,
      })
    } else {
      if (!bindLocationId) {
        toast.error("Selecione um local")
        return
      }
      setQrAlias(unknownPayload.key, {
        kind: "location",
        locationId: bindLocationId,
      })
    }
    toast.success("QR re-vinculado com sucesso")
    setUnknownPayload(null)
    setBindCategoryId(""); setBindItemId(""); setBindLocationId("")
    resumeIfContinuous()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ScanLine className="h-6 w-6 text-primary" />
          Scanner QR Code
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aponte a câmera para o QR de um item ou prateleira para registrar
          entrada/saída.
        </p>
      </header>

      {/* Mode toggles */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3">
        
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={soundOn} onCheckedChange={setSoundOn} />
          <span>Bip ao ler</span>
        </label>

        {lastUndo && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={undoLast}
          >
            <Undo2 className="mr-2 h-4 w-4" /> Desfazer último
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="relative aspect-square w-full bg-black">
          <div
            id={containerId}
            className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
          />
          {scanning && torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "Desligar lanterna" : "Ligar lanterna"}
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70 active:scale-95"
            >
              {torchOn ? (
                <Flashlight className="h-5 w-5 text-yellow-300" />
              ) : (
                <FlashlightOff className="h-5 w-5" />
              )}
            </button>
          )}
          {!scanning && !error && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
              <Camera className="h-10 w-10" />
              <p className="text-sm">Câmera desligada</p>
            </div>
          )}
          {error && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/90">
              <CameraOff className="h-10 w-10" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/40 p-3">
          {!scanning ? (
            <Button onClick={startScanner} className="flex-1">
              <Camera className="mr-2 h-4 w-4" /> Ligar câmera
            </Button>
          ) : (
            <Button onClick={stopScanner} variant="outline" className="flex-1">
              <CameraOff className="mr-2 h-4 w-4" /> Parar
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        💡 Imprima as etiquetas em <strong>Configurações → Etiquetas QR</strong>{" "}
        e cole no rolo, caixa ou prateleira. QRs antigos ou danificados podem
        ser <strong>re-vinculados</strong> sem reimprimir.
      </div>

      {/* Bottom sheet — batch movements from a shelf/location */}
      <Sheet open={!!batchLocationId} onOpenChange={(o) => { if (!o) { closeBatch(); resumeIfContinuous() } }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {locations.find((l) => l.id === batchLocationId)?.name}
            </SheetTitle>
            <SheetDescription>
              Preencha a quantidade apenas dos itens movimentados. Em branco = ignorar.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={batchType === "entrada" ? "default" : "outline"}
                onClick={() => setBatchType("entrada")}
                className={
                  batchType === "entrada"
                    ? "bg-success text-white hover:bg-success/90"
                    : ""
                }
              >
                <ArrowDownCircle className="mr-2 h-4 w-4" /> Entrada
              </Button>
              <Button
                type="button"
                variant={batchType === "saida" ? "default" : "outline"}
                onClick={() => setBatchType("saida")}
                className={
                  batchType === "saida"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : ""
                }
              >
                <ArrowUpCircle className="mr-2 h-4 w-4" /> Saída
              </Button>
            </div>

            <div className="grid max-h-[45vh] gap-2 overflow-y-auto rounded-lg border bg-muted/20 p-2">
              {batchRows.map((row, idx) => {
                const filled = row.qty.trim() !== "" && parseFloat(row.qty) > 0
                const syncedType = batchType
                return (
                  <div
  key={`${row.categoryId}:${row.item.id}`}
  className={`flex items-center gap-3 rounded-md border p-2 transition ${
    !filled ? "bg-card" :
    syncedType === "entrada" ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"
  }`}
>
                      <button
  type="button"
  onClick={() => toggleRowType(idx)}
  className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold transition ${
    batchType === "entrada" 
      ? "bg-green-500/20 text-green-700" 
      : "bg-red-500/20 text-red-700"
  }`}
>
  {batchType === "entrada" ? "ENT" : "SAÍ"}
</button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {row.item.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Saldo: {row.item.quantity.toLocaleString("pt-BR")}{" "}
                        {row.item.unit}
                      </div>
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={row.qty}
                      onChange={(e) => updateBatchQty(idx, e.target.value)}
                      className="h-10 w-24 text-right text-base tabular-nums"
                    />
                    <span className="w-10 text-xs text-muted-foreground">
                      {row.item.unit}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <Label>
                Observação{" "}
                <span className="font-normal text-muted-foreground">
                  (aplicada a todos)
                </span>
              </Label>
              <Textarea
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { closeBatch(); resumeIfContinuous() }}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button className="flex-1" onClick={reviewBatch}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Revisar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom sheet — movement */}
      <Sheet open={!!selectedItem} onOpenChange={(o) => { if (!o) { closeSheet(); resumeIfContinuous() } }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {selectedItem?.item.name}
            </SheetTitle>
            <SheetDescription>
              Saldo atual:{" "}
              <strong>
                {selectedItem?.item.quantity.toLocaleString("pt-BR")}{" "}
                {selectedItem?.item.unit}
              </strong>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={movementType === "entrada" ? "default" : "outline"}
                onClick={() => setMovementType("entrada")}
                className={
                  movementType === "entrada"
                    ? "bg-success text-white hover:bg-success/90"
                    : ""
                }
              >
                <ArrowDownCircle className="mr-2 h-4 w-4" /> Entrada
              </Button>
              <Button
                type="button"
                variant={movementType === "saida" ? "default" : "outline"}
                onClick={() => setMovementType("saida")}
                className={
                  movementType === "saida"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : ""
                }
              >
                <ArrowUpCircle className="mr-2 h-4 w-4" /> Saída
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Quantidade ({selectedItem?.item.unit})</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="Ex: 5"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
                className="h-12 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Observação{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { closeSheet(); resumeIfContinuous() }}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button className="flex-1" onClick={reviewMovement}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Revisar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation summary */}
      <AlertDialog
        open={!!summary}
        onOpenChange={(o) => { if (!o) setSummary(null) }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar {summary?.type === "entrada" ? "entrada" : "saída"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {summary?.kind === "batch"
                ? `${summary?.rows.length} item(ns) afetado(s) em "${summary?.title}". Revise os saldos resultantes antes de confirmar.`
                : `Revise o saldo resultante de "${summary?.title}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {summary && (
            <div className="space-y-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <strong>Total movimentado:</strong>{" "}
                {summary.rows.reduce((s, r) => s + r.qty, 0).toLocaleString("pt-BR")}{" "}
                <span className="text-muted-foreground">
                  ({summary.rows.length} item(ns))
                </span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {summary.rows.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md bg-card px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.itemName}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.previous.toLocaleString("pt-BR")}
                      <span className="mx-1">→</span>
                      <strong
  className={
    (r.type || summary.type) === "entrada"
      ? "text-success"
      : "text-destructive"
  }
>
                        {r.next.toLocaleString("pt-BR")}
                      </strong>{" "}
                      <span className="text-xs">{r.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={applySummary}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unknown / orphan QR — re-bind */}
      <Sheet
        open={!!unknownPayload}
        onOpenChange={(o) => { if (!o) { setUnknownPayload(null); resumeIfContinuous() } }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" /> Re-vincular este QR
            </SheetTitle>
            <SheetDescription>
              Este QR não está vinculado a nada (ou o item original foi removido).
              Você pode <strong>reaproveitar a etiqueta</strong> apontando para
              um item ou local existente — sem reimprimir.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 pb-4">
            <div className="rounded-md border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground break-all">
              {unknownPayload?.raw}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={unknownPayload?.kind === "item" ? "default" : "outline"}
                onClick={() =>
                  setUnknownPayload((p) => p && { ...p, kind: "item" })
                }
              >
                <Package className="mr-2 h-4 w-4" /> Item
              </Button>
              <Button
                variant={unknownPayload?.kind === "location" ? "default" : "outline"}
                onClick={() =>
                  setUnknownPayload((p) => p && { ...p, kind: "location" })
                }
              >
                <MapPin className="mr-2 h-4 w-4" /> Local
              </Button>
            </div>

            {unknownPayload?.kind === "item" ? (
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  value={bindCategoryId}
                  onChange={(e) => { setBindCategoryId(e.target.value); setBindItemId("") }}
                >
                  <option value="">Selecione…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Label>Item</Label>
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  value={bindItemId}
                  onChange={(e) => setBindItemId(e.target.value)}
                  disabled={!bindCategoryId}
                >
                  <option value="">Selecione…</option>
                  {categories
                    .find((c) => c.id === bindCategoryId)
                    ?.items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Local</Label>
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  value={bindLocationId}
                  onChange={(e) => setBindLocationId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setUnknownPayload(null); resumeIfContinuous() }}
              >
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmBind}>
                <Link2 className="mr-2 h-4 w-4" /> Vincular
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
