const money = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** ₲ per token (1 token = ₲1.000), per the Fortune Teller spec. */
const DENOM_GS = 1000;

/**
 * Format an already-Guaraní amount: `₲` prefix, `.` thousands separator, no decimals.
 * e.g. 100000 -> "₲100.000", 5 -> "₲5".
 */
export function formatMoney(amount: number): string {
  return `₲${money.format(amount)}`;
}

/**
 * Format a token/credit amount as Guaraní for display (tokens × ₲1.000).
 * e.g. 20 tokens -> "₲20.000", 1200 tokens -> "₲1.200.000".
 */
export function formatGuarani(tokens: number): string {
  return `₲${money.format(tokens * DENOM_GS)}`;
}
