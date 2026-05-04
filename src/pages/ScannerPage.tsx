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
  MapPin,
  Package,
  ScanLine,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useStockStore } from "@/lib/stock-store"
import { parseQr } from "@/lib/qr"
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
}

export default function ScannerPage() {
  const containerId = "qr-reader-container"
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const { categories, locations, updateItemQuantity } = useStockStore()

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [movementType, setMovementType] = useState<"entrada" | "saida">("saida")
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")

  // Batch (shelf / location) state
  const [batchLocationId, setBatchLocationId] = useState<string | null>(null)
  const [batchType, setBatchType] = useState<"entrada" | "saida">("saida")
  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const [batchNote, setBatchNote] = useState("")

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
    setTorchSupported(!!caps?.torch)
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

  const handleDecoded = async (text: string) => {
    if (text === lastText) return
    setLastText(text)

    const payload = parseQr(text)
    if (!payload) {
      toast.error("QR Code não reconhecido")
      return
    }

    await stopScanner()

    if (payload.kind === "item") {
      const cat = categories.find((c) => c.id === payload.categoryId)
      const item = cat?.items.find((i) => i.id === payload.itemId)
      if (!item || !cat) {
        toast.error("Item não encontrado no estoque")
        return
      }
      setSelectedItem({ categoryId: cat.id, item })
    } else {
      const loc = locations.find((l) => l.id === payload.locationId)
      if (!loc) {
        toast.error("Local não encontrado")
        return
      }
      if (loc.itemRefs.length === 0) {
        toast.error("Este local ainda não tem itens vinculados")
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
          } as BatchRow
        })
        .filter(Boolean) as BatchRow[]
      setBatchRows(rows)
      setBatchType("saida")
      setBatchNote("")
      setBatchLocationId(loc.id)
    }
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
      setTimeout(detectTorchSupport, 500)
    } catch (e: any) {
      setError(
        e?.message ||
          "Não foi possível acessar a câmera. Verifique as permissões do navegador.",
      )
      setScanning(false)
    }
  }

  useEffect(() => {
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeSheet = () => {
    setSelectedItem(null)
    setQty("")
    setNote("")
  }

  const confirmMovement = () => {
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
    const newQty =
      movementType === "entrada"
        ? selectedItem.item.quantity + n
        : selectedItem.item.quantity - n
    updateItemQuantity(
      selectedItem.categoryId,
      selectedItem.item.id,
      newQty,
      movementType,
      n,
      note.trim() || undefined,
    )
    toast.success(
      `${movementType === "entrada" ? "Entrada" : "Saída"} de ${n} ${selectedItem.item.unit} registrada`,
    )
    closeSheet()
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

  const confirmBatch = () => {
    const toApply = batchRows
      .map((r) => ({ row: r, n: parseFloat(r.qty) }))
      .filter(({ n }) => !isNaN(n) && n > 0)

    if (toApply.length === 0) {
      toast.error("Informe a quantidade em pelo menos um item")
      return
    }

    if (batchType === "saida") {
      const insufficient = toApply.find(
        ({ row, n }) => n > row.item.quantity,
      )
      if (insufficient) {
        toast.error(
          `Saldo insuficiente em "${insufficient.row.item.name}"`,
        )
        return
      }
    }

    toApply.forEach(({ row, n }) => {
      const newQty =
        batchType === "entrada"
          ? row.item.quantity + n
          : row.item.quantity - n
      updateItemQuantity(
        row.categoryId,
        row.item.id,
        newQty,
        batchType,
        n,
        batchNote.trim() || undefined,
      )
    })

    toast.success(
      `${toApply.length} ${batchType === "entrada" ? "entrada(s)" : "saída(s)"} registrada(s)`,
    )
    closeBatch()
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
        e cole no rolo, caixa ou prateleira.
      </div>

      {/* Bottom sheet — batch movements from a shelf/location */}
      <Sheet open={!!batchLocationId} onOpenChange={(o) => !o && closeBatch()}>
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
                return (
                  <div
                    key={`${row.categoryId}:${row.item.id}`}
                    className={`flex items-center gap-3 rounded-md border bg-card p-2 transition ${
                      filled ? "border-primary ring-1 ring-primary/30" : ""
                    }`}
                  >
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
              <Button variant="outline" className="flex-1" onClick={closeBatch}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmBatch}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom sheet — movement */}
      <Sheet open={!!selectedItem} onOpenChange={(o) => !o && closeSheet()}>
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
              <Button variant="outline" className="flex-1" onClick={closeSheet}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmMovement}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
