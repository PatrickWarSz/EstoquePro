import { Package, ShoppingCart, Truck, History, Settings, ScanLine, QrCode, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useStockStore } from "@/lib/stock-store";
import { ModuleKey, useAuthStore } from "@/lib/auth-store";

type NavItem = { title: string; url: string; icon: any; module: ModuleKey };

const operacaoAll: NavItem[] = [
  { title: "Estoque", url: "/app/estoque", icon: Package, module: "estoque" },
  { title: "Pedidos", url: "/app/pedidos", icon: ShoppingCart, module: "pedidos" },
  { title: "Fornecedores", url: "/app/fornecedores", icon: Truck, module: "fornecedores" },
  { title: "Histórico", url: "/app/historico", icon: History, module: "historico" },
  { title: "Scanner QR", url: "/app/scanner", icon: ScanLine, module: "scanner" },
  { title: "Etiquetas QR", url: "/app/etiquetas", icon: QrCode, module: "etiquetas" },
];

// O sistemaAll foi removido para limpar a redundância

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { orders } = useStockStore();
  const currentUserId = useAuthStore((s) => s.currentUserId);
  const getCurrentUser = useAuthStore((s) => s.getCurrentUser);
  const user = getCurrentUser();
  const pendingCount = (orders || []).filter(
    (o) => o.deliveryStatus === "Entrega Incompleta",
  ).length;

  const operacao = operacaoAll.filter((i) => user?.permissions[i.module]);
  const isAdmin = user?.kind === "admin" || user?.isAdmin === true;

  const linkBase =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const linkActive =
    "bg-sidebar-accent text-sidebar-primary font-medium";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <NavLink to="/app/estoque" className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-sm font-mono-vexo text-[11px] font-medium">
            <span className="text-primary">&gt;</span>
            <span className="px-0.5">V</span>
            <span className="text-primary">&lt;</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-mono-vexo text-[13px] font-medium tracking-[0.18em] text-foreground">
                <span className="text-primary">&gt;</span> V E X O <span className="text-primary">&lt;</span>
              </span>
              <span className="font-display text-[14px] font-semibold tracking-tight text-foreground">
                EstoquePro
              </span>
              <span className="font-mono-vexo text-[9px] lowercase tracking-[0.18em] text-muted-foreground">
                software &amp; solutions
              </span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Operação
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {operacao.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkBase} activeClassName={linkActive}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.url === "/app/pedidos" && pendingCount > 0 && (
                        <span className="ml-auto rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
                          {pendingCount}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      {isAdmin && (
          <SidebarGroup className="mt-4">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Administração
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/app/funcionarios" className={linkBase} activeClassName={linkActive}>
                      <Users className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Funcionários</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                
                {/* NOVO LINK RESTRITO PARA O DONO: CONFIGURAÇÕES E ASSINATURA */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/app/configuracoes" className={linkBase} activeClassName={linkActive}>
                      <Settings className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Configurações</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="px-3 py-2 font-mono-vexo text-[9px] tracking-[0.15em] text-muted-foreground">
            powered by <span className="text-primary">&gt;</span> V E X O <span className="text-primary">&lt;</span>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}