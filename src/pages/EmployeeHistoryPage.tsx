import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowUp, History as HistoryIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useStockStore } from "@/lib/stock-store"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"

export default function EmployeeHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const { employees } = useAuthStore()
  const { categories } = useStockStore()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const employee = employees.find((e) => e.id === id)

  const entries = useMemo(() => {
    const arr: {
      itemName: string
      categoryName: string
      type: "entrada" | "saida"
      quantity: number
      date: string
      newTotal: number
      unit: string
      note?: string
    }[] = []
    ;(categories || []).forEach((c) =>
      c.items.forEach((it) =>
        it.history.forEach((h) => {
          if (h.operatorId !== id) return
          arr.push({
            itemName: it.name,
            categoryName: c.name,
            type: h.type,
            quantity: h.quantity,
            date: h.date,
            newTotal: h.newTotal,
            unit: it.unit,
            note: h.note,
          })
        }),
      ),
    )
    return arr
      .filter((e) => {
        const d = new Date(e.date)
        if (from && d < new Date(from)) return false
        if (to && d > new Date(to + "T23:59:59")) return false
        return true
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [categories, id, from, to])

  const stats = useMemo(() => {
    const entradas = entries.filter((e) => e.type === "entrada")
    const saidas = entries.filter((e) => e.type === "saida")
    return {
      total: entries.length,
      entradas: entradas.length,
      saidas: saidas.length,
      qtdEntradas: entradas.reduce((s, e) => s + e.quantity, 0),
      qtdSaidas: saidas.reduce((s, e) => s + e.quantity, 0),
    }
  }, [entries])

  if (!employee) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-8">
        <p className="text-sm text-muted-foreground">Funcionário não encontrado.</p>
        <Button variant="outline" asChild className="mt-3 gap-1.5">
          <Link to="/app/funcionarios"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/app/funcionarios"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Histórico de {employee.name}</h2>
          <p className="text-sm text-muted-foreground">@{employee.username}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Movimentações</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Entradas</p>
          <p className="text-2xl font-bold text-success">{stats.entradas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Saídas</p>
          <p className="text-2xl font-bold text-destructive">{stats.saidas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Qtd. total movida</p>
          <p className="text-2xl font-bold">{stats.qtdEntradas + stats.qtdSaidas}</p>
        </Card>
      </div>

      <Card className="mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <span className="text-xs text-muted-foreground">Período:</span>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo("") }}>Limpar</Button>
        )}
      </Card>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">Nenhuma movimentação registrada</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qtd</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.date).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{e.itemName}</div>
                      <div className="text-xs text-muted-foreground">{e.categoryName}</div>
                      {e.note && <div className="text-xs italic text-muted-foreground">{e.note}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          e.type === "entrada"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {e.type === "entrada" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{e.quantity} {e.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{e.newTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
