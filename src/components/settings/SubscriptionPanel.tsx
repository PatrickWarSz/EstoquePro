import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Shield, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubscriptionStatus = "trial" | "active" | "expired";

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
  const handleSubscribe = (plan: "monthly" | "annual") => {
    if (onSubscribe) onSubscribe(plan);
    else console.log("Assinar clicado", plan);
  };

  const statusBadge =
    status === "trial" ? (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1">
        <Clock className="h-3 w-3" /> Período de Teste Ativo
      </Badge>
    ) : status === "active" ? (
      <Badge className="bg-success text-success-foreground hover:bg-success/90 gap-1">
        <Check className="h-3 w-3" /> Assinatura Ativa
      </Badge>
    ) : (
      <Badge variant="destructive">Assinatura Expirada</Badge>
    );

  const monthlyFeatures = ["Itens ilimitados", "Scanner QR completo", "Histórico de movimentações", "Suporte por e-mail"];
  const annualFeatures = [
    "Tudo do plano Mensal",
    "Equipe ilimitada de operadores",
    "Relatórios avançados",
    "Suporte prioritário via WhatsApp",
  ];

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
        {status === "trial" && (
          <p className="text-sm text-muted-foreground">
            Faltam <span className="font-semibold text-foreground">{daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}</span> para o vencimento do seu período de teste.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Planos Disponíveis</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Plano Mensal */}
            <div className="rounded-lg border bg-card p-5 flex flex-col">
              <div className="mb-3">
                <p className="text-sm font-medium text-muted-foreground">Mensal</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatBRL(monthlyPrice)}</span>
                  <span className="text-sm text-muted-foreground">/ mês</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Flexibilidade total, sem fidelidade.</p>
              </div>
              <ul className="mb-5 space-y-2 text-sm flex-1">
                {monthlyFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => handleSubscribe("monthly")}>
                Assinar Mensal
              </Button>
            </div>

            {/* Plano Anual — destaque */}
            <div
              className={cn(
                "relative rounded-lg border-2 border-primary bg-primary/5 p-5 flex flex-col",
                "shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]",
              )}
            >
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground gap-1 shadow">
                <Sparkles className="h-3 w-3" /> Melhor Custo-Benefício
              </Badge>
              <div className="mb-3">
                <p className="text-sm font-medium text-primary">Anual</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatBRL(annualMonthlyPrice)}</span>
                  <span className="text-sm text-muted-foreground">/ mês</span>
                </div>
                <p className="mt-1 text-xs font-medium text-success">
                  Economize {formatBRL(annualSavings)} ao ano
                </p>
              </div>
              <ul className="mb-5 space-y-2 text-sm flex-1">
                {annualFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" className="w-full" onClick={() => handleSubscribe("annual")}>
                Assinar o Estoque PRO
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 border-t pt-4 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>Pagamento 100% seguro. Cancele quando quiser. Suporte incluso.</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default SubscriptionPanel;