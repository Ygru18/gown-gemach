// Money is integer cents everywhere. These helpers never use floating
// point arithmetic on amounts: parsing is done on the string digits.

const MONEY_RE = /^\$?\s*(\d{1,7})(?:\.(\d{0,2}))?$/;

/** Parses "12", "12.5", "$12.50", "1,250.00" into cents. Returns null if invalid. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const m = MONEY_RE.exec(cleaned);
  if (!m) return null;
  const dollars = Number.parseInt(m[1]!, 10);
  const centsPart = (m[2] ?? "").padEnd(2, "0");
  const cents = centsPart === "" ? 0 : Number.parseInt(centsPart, 10);
  return dollars * 100 + cents;
}

export function formatCents(cents: number | null | undefined, opts: { blankZero?: boolean } = {}): string {
  if (cents == null) return "—";
  if (opts.blankZero && cents === 0) return "—";
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}$${withCommas}.${rem.toString().padStart(2, "0")}`;
}

/** Plain "12.50" for form inputs and CSV. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error("Money values must be integer cents");
    total += v;
  }
  return total;
}
