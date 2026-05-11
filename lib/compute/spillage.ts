// Spillage attribution for ASI stock accounting.
//
// Untuk feeding row, hitung berapa ml ASI yang "hilang" karena tumpah —
// supaya stock deduction = amount_asi_ml (diminum) + asi spilled portion.

export type SpillageInput = {
  bottle_content: "asi" | "sufor" | "mix" | null;
  amount_ml: number | null;
  amount_asi_ml: number | null;
  amount_sufor_ml: number | null;
  amount_spilled_ml: number | null;
  spilled_attribution: "asi" | "sufor" | "proporsional" | null;
};

/**
 * Hitung porsi spillage yang dianggap dari ASI (untuk stock deduction).
 * - content asi: semua spilled = ASI
 * - content sufor: tidak ada ASI hilang
 * - content mix + attribution asi: semua spilled = ASI
 * - content mix + attribution sufor: tidak ada ASI hilang
 * - content mix + proporsional: split sesuai rasio asi/(asi+sufor)
 */
export function asiSpilledMl(log: SpillageInput): number {
  const total = log.amount_spilled_ml ?? 0;
  if (total <= 0) return 0;
  if (log.bottle_content === "asi") return total;
  if (log.bottle_content === "sufor") return 0;
  if (log.bottle_content !== "mix") return 0;
  if (log.spilled_attribution === "asi") return total;
  if (log.spilled_attribution === "sufor") return 0;
  const asi = log.amount_asi_ml ?? 0;
  const sufor = log.amount_sufor_ml ?? 0;
  const denom = asi + sufor;
  if (denom <= 0) return 0;
  return Math.round((asi / denom) * total);
}

/** Sufor portion of spillage — informational only, doesn't affect stock. */
export function suforSpilledMl(log: SpillageInput): number {
  const total = log.amount_spilled_ml ?? 0;
  if (total <= 0) return 0;
  return total - asiSpilledMl(log);
}
