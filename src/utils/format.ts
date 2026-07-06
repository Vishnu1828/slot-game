const money = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

/**
 * Format a money amount the way the HUD mockup shows it: a `$` prefix with `.` as the thousands
 * separator and no decimals. e.g. 100000 -> "$100.000", 5 -> "$5".
 */
export function formatMoney(amount: number): string {
  return `$${money.format(amount)}`
}
