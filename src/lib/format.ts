const withCommas = (n: number) => Math.round(n).toLocaleString('en-US');

/** "$180.87" under $1,000; "$1,245" from there up (like the Figma placeholders). */
export function formatMoney(dollars: number): string {
  return dollars < 1000 ? `$${dollars.toFixed(2)}` : `$${withCommas(dollars)}`;
}

/** Whole dollars, e.g. yearly totals: "$362", "$1,245". */
export const formatDollars = (dollars: number) => `$${withCommas(dollars)}`;

export const formatPercent = (percent: number) => `${Math.round(percent)}%`;
