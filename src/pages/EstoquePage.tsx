import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, History, Settings, LayoutList, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/stock/stats-cards";
import { CategoryTabs } from "@/components/stock/category-tabs";
import { StockTable } from "@/components/stock/stock-table";
import { AddItemDialog } from "@/components/stock/add-item-dialog";
import { HistoryDialog } from "@/components/stock/history-dialog";
import { CategoryEditor } from "@/components/stock/category-editor";
import { GlobalHistoryDialog } from "@/components/stock/global-history-dialog";
import { AllCategoriesView } from "@/components/stock/all-categories-view";
import { StockItem } from "@/lib/types";
import { useStockStore } from "@/lib/stock-store";

type StatusFilter = "all" | "garantido" | "baixo" | "zerado";
type ViewMode = "category" | "overview";

export default function EstoquePage() {
  const [params] = useSearchParams();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [globalHistoryOpen, setGlobalHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  const { categories } = useStockStore();
  const hasCategories = (categories || []).length > 0;

  useEffect(() => {
    const q = params.get("q");
    if (q) setStatusFilter("all");
  }, [params]);

  const handleFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter);
    if (filter !== "all") setViewMode("overview");
  };

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Controle de Estoque</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Gerencie seu estoque de matéria prima</p>
        </div>
        <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          <Button variant="outline" size="sm" onClick={() => setGlobalHistoryOpen(true)} className="shrink-0 gap-2">
            <History className="h-4 w-4" /><span className="hidden xs:inline sm:inline">Histórico</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCategoryEditorOpen(true)} className="shrink-0 gap-2">
            <Settings className="h-4 w-4" /><span>Categorias</span>
          </Button>
          <Button size="sm" onClick={() => setAddItemOpen(true)} className="shrink-0 gap-2" disabled={!hasCategories}>
            <Plus className="h-4 w-4" /><span>Novo Item</span>
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <StatsCards activeFilter={statusFilter} onFilterChange={handleFilterChange} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-lg border bg-muted/50 p-0.5 gap-0.5">
          <Button variant={viewMode === "overview" ? "default" : "ghost"} size="sm" className="h-7 gap-1.5 px-3 text-xs" onClick={() => setViewMode("overview")}>
            <LayoutList className="h-3.5 w-3.5" />Visão Geral
          </Button>
          <Button variant={viewMode === "category" ? "default" : "ghost"} size="sm" className="h-7 gap-1.5 px-3 text-xs" onClick={() => { setViewMode("category"); setStatusFilter("all"); }}>
            <Table2 className="h-3.5 w-3.5" />Por Categoria
          </Button>
        </div>
      </div>

      {viewMode === "overview" ? (
        <AllCategoriesView statusFilter={statusFilter} onClearFilter={() => setStatusFilter("all")} />
      ) : (
        <>
          <div className="mb-6"><CategoryTabs onEditCategories={() => setCategoryEditorOpen(true)} /></div>
          <StockTable onViewHistory={(item) => setHistoryItem(item)} onAddItem={() => setAddItemOpen(true)} />
        </>
      )}

      <AddItemDialog open={addItemOpen} onOpenChange={setAddItemOpen} />
      <HistoryDialog item={historyItem} open={historyItem !== null} onOpenChange={(open) => !open && setHistoryItem(null)} />
      <CategoryEditor open={categoryEditorOpen} onOpenChange={setCategoryEditorOpen} />
      <GlobalHistoryDialog open={globalHistoryOpen} onOpenChange={setGlobalHistoryOpen} />
    </div>
  );
}
