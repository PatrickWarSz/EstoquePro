import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import { useAuthStore } from "@/lib/auth-store";
import { Moon, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Importa a nova tela de vendas que o Lovable fez
import { SubscriptionPanel, SubscriptionStatus } from "@/components/settings/SubscriptionPanel";

export default function ConfiguracoesPage() {
  const { theme, setTheme } = useTheme();
  const workspaceId = useAuthStore((s) => s.workspaceId);

  // Estados para controlar o tempo real da assinatura no Supabase
  const[status, setStatus] = useState<SubscriptionStatus>("trial");
  const [daysRemaining, setDaysRemaining] = useState(7);
  const [loadingSub, setLoadingSub] = useState(true);

  // Busca o status real lá no cofre do banco de dados assim que a tela abre
  useEffect(() => {
    async function fetchSubscription() {
      if (!workspaceId) return;
      const { supabase } = await import("@/lib/supabase");
      
      const { data, error } = await supabase
        .from("workspaces")
        .select("status_assinatura, data_vencimento")
        .eq("id", workspaceId)
        .single();

      if (data) {
        // Converte o status do banco para a tela
        if (data.status_assinatura === "active") setStatus("active");
        else if (data.status_assinatura === "trialing") setStatus("trial");
        else setStatus("expired");

        // Calcula quantos dias exatos faltam para o teste acabar
        if (data.data_vencimento) {
          const diffTime = new Date(data.data_vencimento).getTime() - new Date().getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          setDaysRemaining(Math.max(0, diffDays));
          
          // Se passou do prazo e ainda era trial, consideramos expirado
          if (diffDays <= 0 && data.status_assinatura === "trialing") {
            setStatus("expired");
          }
        }
      }
      setLoadingSub(false);
    }
    fetchSubscription();
  }, [workspaceId]);

 const handleSubscribe = async (plan: "monthly" | "annual") => {
    const toastId = toast.loading(`Gerando fatura do plano ${plan === "annual" ? "Anual" : "Mensal"} no Asaas...`);
    
    try {
      const { supabase } = await import("@/lib/supabase");
      
      // SEGURANÇA: Passar o token JWT para autenticar a Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      // Chama a Edge Function que você acabou de fazer o deploy!
      const { data, error } = await supabase.functions.invoke('asaas-checkout', {
        body: { workspaceId, plan },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.dismiss(toastId);
      toast.success("Fatura gerada com sucesso!");
      
      // O PULO DO GATO: Abre o link oficial de pagamento do Asaas
      if (data?.invoiceUrl) {
        window.open(data.invoiceUrl, "_blank");
      }
      
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Erro ao conectar com o financeiro.");
      // Log de erro sem expor dados sensíveis
      console.error("[handleSubscribe] Erro ao processar checkout:", err.message);
    }
  };

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">Preferências do sistema e Assinatura</p>
      </div>

      {/* O PAINEL DE ASSINATURA REAL */}
      {loadingSub ? (
        <Card className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </Card>
      ) : (
        <SubscriptionPanel
          status={status}
          daysRemaining={daysRemaining}
          onSubscribe={handleSubscribe}
        />
      )}

      {/* O TEMA ESCURO (O botão de apagar histórico foi removido por segurança) */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Moon className="h-5 w-5" />
            </div>
            <div>
              <Label className="text-sm font-medium">Tema escuro</Label>
              <p className="text-xs text-muted-foreground">Alterna entre tema claro e escuro</p>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
        </div>
      </Card>

    </div>
  );
}