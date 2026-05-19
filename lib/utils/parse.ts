// Locale-tolerant decimal parsing. iOS Safari dengan locale id-ID
// nampilin "," sebagai decimal separator di numeric keypad — user
// type "3,1" → Number("3,1") = NaN → form gagal validate.
//
// Normalize "," → "." sebelum Number(). Output null kalau tidak
// finite (NaN/Infinity).
export function parseDecimal(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
