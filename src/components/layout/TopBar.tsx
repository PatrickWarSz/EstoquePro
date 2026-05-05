import { Search, Moon, Sun, AlertTriangle, LogOut, User as UserIcon, Shield } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useStockStore } from "@/lib/stock-store";
import { useAuthStore } from "@/lib/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const { categories } = useStockStore();
  const user = useAuthStore((s) => s.getCurrentUser());
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const lowOrZero = useMemo(() => {
    let n = 0;
    (categories || []).forEach((c) =>
      c.items.forEach((i) => {
        if (i.quantity === 0 || i.quantity <= i.minQuantity) n++;
      }),
    );
    return n;
  }, [categories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/estoque?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger className="h-8 w-8" />

      <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item, fornecedor, pedido..."
          className="h-9 pl-9 pr-16 bg-muted/40 border-border"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {lowOrZero > 0 && (
          <button
            onClick={() => navigate("/estoque")}
            className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {lowOrZero} {lowOrZero === 1 ? "alerta" : "alertas"}
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                  {user.kind === "admin" ? <Shield className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden text-xs font-medium md:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{user.name}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  @{user.username} · {user.kind === "admin" ? "Administrador" : "Operador"}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user.kind === "admin" && (
                <DropdownMenuItem onClick={() => navigate("/app/funcionarios")}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  Funcionários
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
