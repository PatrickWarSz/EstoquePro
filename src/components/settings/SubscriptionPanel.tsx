import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Shield, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";

export type SubscriptionStatus = "trial" | "active" | "expired" | "canceled";

interface SubscriptionPanelProps {
  status?: SubscriptionStatus;
  daysRemaining?: number;
  monthlyPrice?: number;
  annualMonthlyPrice?: number;
  annualSavings?: number;
  onSubscribe?: (plan: "monthly" | "annual") => void;
}

const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function SubscriptionPanel({
  status = "trial",
  daysRemaining = 7,
  monthlyPrice = 147,
  annualMonthlyPrice = 97,
  annualSavings = 600,
  onSubscribe,
}: SubscriptionPanelProps) {
  
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);
  const[canceling, setCanceling] = useState(false);
  const[upgrading, setUpgrading] = useState(false);
  const[currentPlan, setCurrentPlan] = useState<string>("estoque_pro"); // "estoque_pro" (mensal) ou "anual"

  // Busca qual o plano atual no banco para exibir o botão correto
  useEffect(() => {
    async function checkPlan() {
      if (!workspaceId) return;
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.from('workspaces').select('plano_atual').eq('id', workspaceId).single();
      if (data) setCurrentPlan(data.plano_atual);
    }
    checkPlan();
  }, [workspaceId]);

  const handleSubscribe = (plan: "monthly" | "annual") => {
    // Se o cliente for MENSAL e clicar no ANUAL, nós chamamos a função mágica de UPGRADE!
    if (status === "active" && currentPlan !== "anual" && plan === "annual") {
      handleUpgrade();
      return;
    }
    // Caso contrário (novo cliente), segue o fluxo normal de criar a primeira fatura
    if (onSubscribe) onSubscribe(plan);
  };

  const handleUpgrade = async () => {
    if (!confirm("Você será alterado para o Plano Anual e uma nova cobrança será gerada. Deseja continuar?")) return;
    
    setUpgrading(true);
    const toastId = toast.loading("Processando seu upgrade de plano...");
    
    try {
      const { supabase } = await import("@/lib/supabase");
      
      // SEGURANÇA: Passar o token JWT para autenticar a Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('asaas-upgrade-sub', {
        body: { workspaceId, newPlan: "annual" },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.dismiss(toastId);
      toast.success("Upgrade realizado com sucesso! Bem-vindo ao plano Anual 🚀");
      setCurrentPlan("anual");
      await refreshSubscription();
      
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Erro ao processar upgrade. Contate o suporte.");
    } finally {
      setUpgrading(false);
    }
  };

  // Função do Cancelamento (que fizemos na etapa anterior)
  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar sua assinatura? O acesso ao sistema será suspenso no fim do ciclo.")) return;
    
    setCanceling(true);
    const toastId = toast.loading("Cancelando assinatura...");
    
    try {
      const { supabase } = await import("@/lib/supabase");
      
      // SEGURANÇA: Passar o token JWT para autenticar a Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('asaas-cancel-sub', { 
        body: { workspaceId },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.dismiss(toastId);
      toast.success("Assinatura cancelada com sucesso.");
      await refreshSubscription();
      
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Erro ao cancelar. Contate o suporte.");
    } finally {
      setCanceling(false);
    }
  };

  const statusBadge =
    status === "trial" ? (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1"><Clock className="h-3 w-3" /> Período de Teste Ativo</Badge>
    ) : status === "active" ? (
      <Badge className="bg-success text-success-foreground hover:bg-success/90 gap-1"><Check className="h-3 w-3" /> Assinatura Ativa</Badge>
    ) : status === "canceled" ? (
      <Badge variant="outline" className="text-muted-foreground gap-1 border-muted-foreground/30"><AlertCircle className="h-3 w-3" /> Assinatura Cancelada</Badge>
    ) : (
      <Badge variant="destructive">Assinatura Expirada</Badge>
    );

  const monthlyFeatures =["Itens ilimitados", "Scanner QR completo", "Histórico de movimentações", "Suporte por e-mail"];
  const annualFeatures =["Tudo do plano Mensal", "Equipe ilimitada de operadores", "Relatórios avançados", "Suporte prioritário via WhatsApp"];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Assinatura</CardTitle>
            <CardDescription>Gerencie seu plano do Estoque PRO</CardDescription>
          </div>
          {statusBadge}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <div className="grid gap-4 md:grid-cols-2">
            
            {/* PLANO MENSAL */}
            <div className="rounded-lg border bg-card p-5 flex flex-col opacity-90">
              <div className="mb-3">
                <p className="text-sm font-medium text-muted-foreground">Mensal</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatBRL(monthlyPrice)}</span>
                  <span className="text-sm text-muted-foreground">/ mês</span>
                </div>
              </div>
              <ul className="mb-5 space-y-2 text-sm flex-1">
                {monthlyFeatures.map((f) => (<li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>{f}</span></li>))}
              </ul>
              <Button variant="outline" onClick={() => handleSubscribe("monthly")} disabled={status === "active" || currentPlan === "anual"}>
                {status === "active" && currentPlan !== "anual" ? "Seu Plano Atual" : "Assinar Mensal"}
              </Button>
            </div>

            {/* PLANO ANUAL */}
            <div className={cn("relative rounded-lg border-2 border-primary bg-primary/5 p-5 flex flex-col", "shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]")}>
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground gap-1 shadow"><Sparkles className="h-3 w-3" /> Melhor Custo-Benefício</Badge>
              <div className="mb-3">
                <p className="text-sm font-medium text-primary">Anual</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatBRL(annualMonthlyPrice)}</span><span className="text-sm text-muted-foreground">/ mês</span>
                </div>
                <p className="mt-1 text-xs font-medium text-success">Economize {formatBRL(annualSavings)} ao ano</p>
              </div>
              <ul className="mb-5 space-y-2 text-sm flex-1">
                {annualFeatures.map((f) => (<li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>{f}</span></li>))}
              </ul>
              <Button size="lg" className="w-full" onClick={() => handleSubscribe("annual")} disabled={currentPlan === "anual" || upgrading}>
                {currentPlan === "anual" ? "Seu Plano Atual 🏆" : (status === "active" ? "Fazer UPGRADE para Anual" : "Assinar o Estoque PRO")}
              </Button>
            </div>

          </div>
        </div>

        {/* RODAPÉ E CANCELAMENTO */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5" /><span>Pagamento 100% seguro. Cancele quando quiser.</span></div>
          {status === 'active' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleCancel} disabled={canceling}>
              {canceling ? "Processando..." : "Cancelar Assinatura"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SubscriptionPanel;