import { Package, ShoppingCart, Truck, History, Settings, ScanLine, QrCode, Users, Sigma } from "lucide-react";
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

function EstoqueProLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="h-6 w-6 fill-current">
          <path d="M27 10h10l5 7H22l5-7Z" opacity="0.98" />
          <path d="M13 28h16v14H13V28Zm22 0h16v14H35V28Z" />
          <path d="M26 19h12v15H26V19Z" />
          <path d="M24 46h16v7H24v-7Zm-12-1h17v6H12v-6Zm23 0h17v6H35v-6Z" opacity="0.95" />
        </svg>
      </span>
      {!collapsed && <span className="truncate text-base font-semibold text-sidebar-foreground">EstoquePro</span>}
    </div>
  );
}

const operacaoAll: NavItem[] = [
  { title: "Estoque", url: "/app/estoque", icon: Package, module: "estoque" },
  { title: "Pedidos", url: "/app/pedidos", icon: ShoppingCart, module: "pedidos" },
  { title: "Fornecedores", url: "/app/fornecedores", icon: Truck, module: "fornecedores" },
  { title: "Somatórios", url: "/app/somatorios", icon: Sigma, module: "somatorios" },
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

  const isAdmin =
    user?.kind === "admin" ||
    user?.isAdmin === true ||
    (user as any)?.tipo === "admin";
  const operacao = operacaoAll.filter(
    (i) => isAdmin || user?.permissions?.[i.module],
  );

  const linkBase =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const linkActive =
    "bg-sidebar-accent text-sidebar-primary font-medium";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <NavLink to="/app/estoque" className="flex items-center px-3 py-3">
          <EstoqueProLogo collapsed={collapsed} />
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