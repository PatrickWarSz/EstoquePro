import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Camera,
  CameraOff,
  CheckCircle2,
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

export default function ScannerPage() {
  const containerId = "qr-reader-container"
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)

  const { categories, locations, updateItemQuantity } = useStockStore()

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [pickFromLocationId, setPickFromLocationId] = useState<string | null>(null)
  const [movementType, setMovementType] = useState<"entrada" | "saida">("saida")
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")

  const stopScanner = async () => {
    const s = scannerRef.current
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
      setPickFromLocationId(loc.id)
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

  const locationItems = (() => {
    if (!pickFromLocationId) return []
    const loc = locations.find((l) => l.id === pickFromLocationId)
    if (!loc) return []
    return loc.itemRefs
      .map((ref) => {
        const [catId, itemId] = ref.split(":")
        const cat = categories.find((c) => c.id === catId)
        const item = cat?.items.find((i) => i.id === itemId)
        if (!cat || !item) return null
        return { categoryId: cat.id, categoryName: cat.name, item }
      })
      .filter(Boolean) as Array<{
      categoryId: string
      categoryName: string
      item: StockItem
    }>
  })()

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
        <div
          id={containerId}
          className="aspect-square w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        >
          {!scanning && !error && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/80">
              <Camera className="h-10 w-10" />
              <p className="text-sm">Câmera desligada</p>
            </div>
          )}
          {error && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-white/90">
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

      {/* Bottom sheet — pick item from location */}
      <Sheet open={!!pickFromLocationId} onOpenChange={(o) => !o && setPickFromLocationId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {locations.find((l) => l.id === pickFromLocationId)?.name}
            </SheetTitle>
            <SheetDescription>
              Selecione o item desta prateleira para movimentar.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid max-h-[60vh] gap-2 overflow-y-auto pb-4">
            {locationItems.map(({ categoryId, categoryName, item }) => (
              <button
                key={`${categoryId}:${item.id}`}
                onClick={() => {
                  setPickFromLocationId(null)
                  setSelectedItem({ categoryId, item })
                }}
                className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{categoryName}</div>
                </div>
                <div className="text-sm tabular-nums">
                  {item.quantity.toLocaleString("pt-BR")} {item.unit}
                </div>
              </button>
            ))}
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
