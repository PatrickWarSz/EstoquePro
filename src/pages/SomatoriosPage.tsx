import { useEffect, useMemo, useState } from "react"
import { Plus, Pencil, Trash2, Sigma, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useStockStore } from "@/lib/stock-store"
import { useAuthStore } from "@/lib/auth-store"
import { useSomatoriosStore, type Somatorio } from "@/lib/somatorios-store"
import { SomatorioEditor } from "@/components/stock/somatorio-editor"
import { formatQuantity } from "@/lib/units"
import { cn } from "@/lib/utils"

function itemUnit(catUnit: string | undefined, itemUnit: string | undefined) {
  return (itemUnit || catUnit || "").trim()
}

export default function SomatoriosPage() {
  const { categories } = useStockStore()
  const workspaceId = useAuthStore((s) => s.workspaceId)
  const all = useSomatoriosStore((s) => s.somatorios)
  const remove = useSomatoriosStore((s) => s.remove)
  const load = useSomatoriosStore((s) => s.load)
  const loading = useSomatoriosStore((s) => s.loading)
  const loadedWorkspaceId = useSomatoriosStore((s) => s.loadedWorkspaceId)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Somatorio | null>(null)

  // Carrega/recarrega sempre que o workspace mudar ou ao abrir a página
  useEffect(() => {
    load(workspaceId)
  }, [workspaceId, load])

  const somatorios = useMemo(
    () => all.filter((s) => s.workspaceId === workspaceId),
    [all, workspaceId],
  )

  // Mapa rápido: ref => { qty, name, unit }
  const itemIndex = useMemo(() => {
    const map = new Map<
      string,
      { qty: number; name: string; unit: string; categoryName: string }
    >()
    for (const cat of categories || []) {
      for (const it of cat.items || []) {
        map.set(`${cat.id}:${it.id}`, {
          qty: Number(it.quantity) || 0,
          name: it.name,
          unit: itemUnit(cat.unit, it.unit),
          categoryName: cat.name,
        })
      }
    }
    return map
  }, [categories])

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Somatórios</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Totais agrupados de itens selecionados — cada somatório usa uma única unidade.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> Novo somatório
        </Button>
      </div>

      {somatorios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Sigma className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum somatório criado</p>
            <p className="text-sm text-muted-foreground">
              Crie totalizadores como "Tecidos pretos", "Elásticos JB" e veja a soma sempre que abrir esta aba.
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setEditorOpen(true) }}>
            <Plus className="h-4 w-4" /> Criar primeiro somatório
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {somatorios.map((s) => {
            const refs = s.itemRefs
              .map((r) => ({ ref: r, info: itemIndex.get(r) }))
              .filter((x) => x.info)
            const total = refs.reduce((acc, x) => acc + (x.info?.qty || 0), 0)
            const missing = s.itemRefs.length - refs.length
            const min = s.minQuantity ?? null
            const status: "zerado" | "baixo" | "ok" =
              total === 0
                ? "zerado"
                : min != null && total <= min
                  ? "baixo"
                  : "ok"

            return (
              <Card key={s.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold leading-tight">{s.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {refs.length} {refs.length === 1 ? "item" : "itens"}
                      {missing > 0 && (
                        <span className="ml-1 text-warning">· {missing} removido(s)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(s)
                        setEditorOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`Excluir somatório "${s.name}"?`)) return
                        try {
                          await remove(s.id)
                          toast.success("Somatório excluído.")
                        } catch (e: any) {
                          toast.error(e?.message || "Erro ao excluir.")
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    status === "ok" && "border-success/30 bg-success/5",
                    status === "baixo" && "border-warning/40 bg-warning/5",
                    status === "zerado" && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Total
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      status === "ok" && "text-success",
                      status === "baixo" && "text-warning",
                      status === "zerado" && "text-destructive",
                    )}
                  >
                    {formatQuantity(total, s.unit)}
                  </p>
                  {min != null && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-warning" />
                      )}
                      Mínimo: {formatQuantity(min, s.unit)}
                    </p>
                  )}
                </div>

                {refs.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {refs.slice(0, 5).map(({ ref, info }) => (
                      <div key={ref} className="flex items-center justify-between gap-2">
                        <span className="truncate text-muted-foreground">
                          <span className="text-foreground">{info!.name}</span>
                          <span className="ml-1 opacity-60">· {info!.categoryName}</span>
                        </span>
                        <span className="tabular-nums">{info!.qty.toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                    {refs.length > 5 && (
                      <p className="text-[11px] text-muted-foreground">
                        + {refs.length - 5} outro(s)
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <SomatorioEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
      />
    </div>
  )
}