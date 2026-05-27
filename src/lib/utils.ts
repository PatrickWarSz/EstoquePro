import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Order } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateDeliveryMessage(
  order: Order,
  supplierName: string,
  linkedItemUnit?: string,
): string {
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("pt-BR")
  }
  const unit = order.unit || "kg"
  const itemUnit = linkedItemUnit || "un"
  const toDeliver = order.quantityOrdered - order.quantityDelivered
  const status = toDeliver > 0 ? `⚠️ Saldo pendente: ${toDeliver.toLocaleString("pt-BR")} ${unit}` : `✅ Pedido entregue integralmente`

  return `📦 *REGISTRO DE ENTREGA — ESTOQUEPRO*
━━━━━━━━━━━━━━━━━━━━
🏷️ *Produto:* ${order.productDescription}
🏢 *Fornecedor:* ${supplierName}
━━━━━━━━━━━━━━━━━━━━
📊 *Quantidade Pedida:* ${order.quantityOrdered.toLocaleString("pt-BR")} ${unit}
✅ *Quantidade Recebida:* ${order.quantityDelivered.toLocaleString("pt-BR")} ${unit}
${order.stockEntryQuantity ? `📦 *Lançado no Estoque:* ${order.stockEntryQuantity.toLocaleString("pt-BR")} ${itemUnit}` : ""}
━━━━━━━━━━━━━━━━━━━━
📅 *Previsão de Entrega:* ${formatDate(order.expectedDate)}
🕐 *Data de Entrega:* ${formatDate(order.deliveryDate)}
${status}
${order.notes ? `\n📝 *Obs:* ${order.notes}` : ""}
━━━━━━━━━━━━━━━━━━━━
_Registrado via EstoquePro · VEXO_`
}

export function openWhatsAppWeb(message: string) {
  const encodedMessage = encodeURIComponent(message);
  window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
}
