
import { useState } from "react"
import { History, ArrowUpCircle, ArrowDownCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StockItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useStockStore } from "@/lib/stock-store"

interface HistoryDialogProps {
  item: StockItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HistoryDialog({ item, open, onOpenChange }: HistoryDialogProps) {
  if (!item) return null

  const { fetchMoreHistory } = useStockStore()
  const [loadingMore, setLoadingMore] = useState(false)
  const [noMore, setNoMore] = useState(false)

  const handleLoadMore = async () => {
    const prevLen = item.history.length
    setLoadingMore(true)
    await fetchMoreHistory(item.id)
    setLoadingMore(false)
    // Se não veio nada novo, não tem mais
    if (item.history.length === prevLen) setNoMore(true)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico de Movimentações
          </DialogTitle>
          <DialogDescription>
            {item.name} - Estoque atual:{" "}
            <strong>
              {item.quantity} {item.unit}
            </strong>
          </DialogDescription>
        </DialogHeader>
        {item.history.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Nenhuma movimentação registrada
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {item.history
                .slice()
                .reverse()
                .map((entry, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3",
                      entry.type === "entrada"
                        ? "border-success/20 bg-success/5"
                        : "border-destructive/20 bg-destructive/5"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-full p-1.5",
                        entry.type === "entrada"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {entry.type === "entrada" ? (
                        <ArrowUpCircle className="h-4 w-4" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "font-medium",
                            entry.type === "entrada"
                              ? "text-success"
                              : "text-destructive"
                          )}
                        >
                          {entry.type === "entrada" ? "+" : "-"}
                          {entry.quantity} {item.unit}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.date)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.type === "entrada" ? "Entrada" : "Saída"} -{" "}
                        Estoque após: {entry.newTotal} {item.unit}
                      </p>
                      {entry.operatorName && (
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Operador: {entry.operatorName}
                        </p>
                      )}
                      {entry.note && (
                        <p className="text-[11px] italic text-muted-foreground">{entry.note}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
        {item.history.length > 0 && !noMore && (
          <div className="pt-1 text-center">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              disabled={loadingMore}
              onClick={handleLoadMore}
            >
              {loadingMore ? "Carregando..." : "Carregar movimentações anteriores"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
