import { useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Package, Hash } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useStockStore } from "@/lib/stock-store"
import { StockItem } from "@/lib/types"
import { toast } from "sonner"

interface MovementDialogProps {
  item: StockItem | null
  categoryId: string | null
  type: "entrada" | "saida"
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MovementDialog({
  item,
  categoryId,
  type,
  open,
  onOpenChange,
}: MovementDialogProps) {
  const { updateItemQuantity } = useStockStore()
  
  // Estado original para unidades
  const [quantity, setQuantity] = useState("")
  const [note, setNote] = useState("")

  // Novos estados para a Calculadora Dinâmica (Agora baseada em Volumes)
  const[mode, setMode] = useState<"units" | "volumes">("units")
  const[volumes, setVolumes] = useState<string[]>([""]) // Começa com 1 volume vazio

  const isEntrada = type === "entrada"

  // Soma o total de todos os volumes
  const totalVolumeQty = volumes.reduce((acc, val) => acc + (parseFloat(val) || 0), 0)

  const handleClose = () => {
    setQuantity("")
    setNote("")
    setMode("units")
    setVolumes([""])
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (!item || !categoryId) return

    let finalQty = 0;
    let finalNote = note.trim();

    // Se for Entrada E estiver no modo Volumes Variados
    if (isEntrada && mode === "volumes") {
      finalQty = totalVolumeQty;
      if (finalQty <= 0) {
        toast.error("Informe as quantidades dos volumes")
        return
      }
      // Auditoria automática: Registra o tamanho dos volumes no histórico
      const volumesDetails = volumes.filter(b => parseFloat(b) > 0).join(" + ");
      finalNote = finalNote 
        ? `${finalNote} (Lotes/Volumes: ${volumesDetails})` 
        : `Entrada em volumes: ${volumesDetails}`;
    } else {
      // Modo normal (Unidades avulsas ou Saída)
      finalQty = parseFloat(quantity);
      if (isNaN(finalQty) || finalQty <= 0) {
        toast.error("Informe uma quantidade válida")
        return
      }
    }

    if (!isEntrada && finalQty > item.quantity) {
      toast.error("Quantidade maior que o saldo disponível")
      return
    }

    const newQuantity = isEntrada
      ? item.quantity + finalQty
      : item.quantity - finalQty

    // Mandamos para o backend sem alterar a estrutura dele!
    updateItemQuantity(
      categoryId,
      item.id,
      newQuantity,
      type,
      finalQty,
      finalNote || undefined
    )

    toast.success(`${isEntrada ? "Entrada" : "Saída"} de ${finalQty} ${item.unit} registrada`)
    handleClose()
  }

  const addVolume = () => setVolumes([...volumes, ""])
  
  const removeVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index))
  }

  const updateVolume = (index: number, value: string) => {
    const newVolumes = [...volumes]
    newVolumes[index] = value
    setVolumes(newVolumes)
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEntrada ? (
              <ArrowDownCircle className="h-5 w-5 text-success" />
            ) : (
              <ArrowUpCircle className="h-5 w-5 text-destructive" />
            )}
            {isEntrada ? "Registrar Entrada" : "Registrar Saída"}
          </DialogTitle>
          <DialogDescription>
            {item.name} — Estoque atual:{" "}
            <strong className="text-foreground">
              {item.quantity.toLocaleString("pt-BR")} {item.unit}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          
          {/* SELETOR DE MODO (Apenas para Entrada) */}
          {isEntrada && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <Button 
                type="button"
                variant={mode === "units" ? "default" : "ghost"} 
                className="flex-1 h-8 text-xs font-semibold" 
                onClick={() => setMode("units")}
              >
                <Hash className="w-3.5 h-3.5 mr-1" /> Total / Avulso
              </Button>
              <Button 
                type="button"
                variant={mode === "volumes" ? "default" : "ghost"} 
                className="flex-1 h-8 text-xs font-semibold" 
                onClick={() => setMode("volumes")}
              >
                <Package className="w-3.5 h-3.5 mr-1" /> Volumes Variados
              </Button>
            </div>
          )}

          {/* MODO UNIDADES AVULSAS (Ou Saída Padrão) */}
          {(!isEntrada || mode === "units") ? (
            <div className="space-y-2">
              <Label htmlFor="mov-qty">Quantidade Total ({item.unit})</Label>
              <Input
                id="mov-qty"
                type="number"
                min="0.01"
                step="0.01"
                placeholder={`Ex: 50`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}

                onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              />
            </div>
          ) : (
            /* MODO VOLUMES VARIADOS (A Mágica Logística) */
            <div className="space-y-3 p-3 border rounded-md bg-muted/20">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Volumes / Lotes Recebidos ({item.unit})
              </Label>
              
              <div className="max-h-[30vh] overflow-y-auto space-y-2 pr-1">
                {volumes.map((v, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex items-center justify-center bg-primary/10 text-primary w-7 h-9 rounded text-xs font-bold shrink-0">
                      {index + 1}
                    </div>
                    <Input 
                      type="number" 
                      min="0.01"
                      step="0.01"
                      placeholder="Qtd neste volume/lote" 
                      value={v} 
                      onChange={(e) => updateVolume(index, e.target.value)} 
                      className="h-9"

                    />
                    {volumes.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeVolume(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addVolume}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Volume
              </Button>

              <div className="pt-3 mt-1 border-t flex justify-between items-center">
                <span className="text-sm font-semibold">Total da Entrada:</span>
                <span className="text-lg font-black text-primary">{totalVolumeQty} {item.unit}</span>
              </div>
            </div>
          )}

          {/* OBSERVAÇÃO */}
          <div className="space-y-2">
            <Label htmlFor="mov-note">
              Observação <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="mov-note"
              placeholder="Ex: NF 1234, fornecedor atrasou..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none h-16"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className={
              isEntrada
                ? "bg-success hover:bg-success/90 text-white"
                : "bg-destructive hover:bg-destructive/90 text-white"
            }
          >
            Confirmar {isEntrada ? "Entrada" : "Saída"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}