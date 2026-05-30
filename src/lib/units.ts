// Helper de pluralização e formatação de unidades
// short = forma curta (telas apertadas / mobile)
// long  = forma por extenso, respeitando singular/plural

type UnitDef = { singular: string; plural: string; short: string };

const UNITS: Record<string, UnitDef> = {
  un: { singular: "unidade", plural: "unidades", short: "un" },
  pc: { singular: "peça", plural: "peças", short: "pç" },
  cx: { singular: "caixa", plural: "caixas", short: "cx" },
  par: { singular: "par", plural: "pares", short: "par" },
  kit: { singular: "kit", plural: "kits", short: "kit" },
  rolo: { singular: "rolo", plural: "rolos", short: "rolo" },
  m: { singular: "metro", plural: "metros", short: "m" },
  cm: { singular: "centímetro", plural: "centímetros", short: "cm" },
  kg: { singular: "quilograma", plural: "quilogramas", short: "kg" },
  g: { singular: "grama", plural: "gramas", short: "g" },
  L: { singular: "litro", plural: "litros", short: "L" },
  ml: { singular: "mililitro", plural: "mililitros", short: "ml" },
};

export function pluralizeUnit(qty: number, unit?: string, opts?: { short?: boolean }): string {
  const u = unit ? UNITS[unit] : undefined;
  if (!u) return unit || "";
  if (opts?.short) return u.short;
  return Math.abs(qty) === 1 ? u.singular : u.plural;
}

export function formatQuantity(
  qty: number,
  unit?: string,
  opts?: { short?: boolean },
): string {
  const num = qty.toLocaleString("pt-BR");
  const u = pluralizeUnit(qty, unit, opts);
  return u ? `${num} ${u}` : num;
}