import { ageInMonths } from "@/lib/constants/who-percentiles";
import { MILESTONES_LIST } from "@/lib/constants/milestones";
import { IMUNISASI_LIST } from "@/lib/constants/imunisasi";
import { fmtDate } from "@/lib/compute/format";

export type BabyMeta = {
  id: string;
  name: string;
  gender: "female" | "male";
  dob: string;
  birth_weight_kg: number;
  birth_height_cm: number;
};

export type LogRow = {
  id: string;
  subtype: string;
  timestamp: string;
  end_timestamp: string | null;
  amount_ml: number | null;
  amount_l_ml: number | null;
  amount_r_ml: number | null;
  duration_l_min: number | null;
  duration_r_min: number | null;
  has_pee: boolean | null;
  has_poop: boolean | null;
  poop_color: string | null;
  poop_consistency: string | null;
  temp_celsius: number | null;
  med_name: string | null;
  med_dose: string | null;
  notes: string | null;
};

export type GrowthRow = {
  measured_at: string;
  weight_kg: number;
  height_cm: number;
  head_circ_cm: number | null;
  notes: string | null;
};

export type ProgressMap = Map<string, string>;

// ===================== CSV BUILDER =====================

function csvEscape(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

function logDetailCsv(l: LogRow): string {
  if (l.subtype === "feeding") {
    if (l.amount_ml != null) return `Susu ${l.amount_ml} ml`;
    return `DBF L:${l.duration_l_min ?? 0}m R:${l.duration_r_min ?? 0}m`;
  }
  if (l.subtype === "pumping")
    return `Pumping L:${l.amount_l_ml ?? 0}ml R:${l.amount_r_ml ?? 0}ml`;
  if (l.subtype === "diaper") {
    const parts: string[] = [];
    if (l.has_pee) parts.push("pipis");
    if (l.has_poop) {
      const p = [l.poop_color, l.poop_consistency].filter(Boolean).join(" ");
      parts.push(p ? `BAB(${p})` : "BAB");
    }
    return parts.join(" + ");
  }
  if (l.subtype === "sleep") {
    if (!l.end_timestamp) return "Tidur (berlangsung)";
    const dur = Math.round(
      (new Date(l.end_timestamp).getTime() -
        new Date(l.timestamp).getTime()) /
        60000,
    );
    return `Tidur ${Math.floor(dur / 60)}j${dur % 60}m`;
  }
  if (l.subtype === "bath") return "Mandi";
  if (l.subtype === "temp") return `Suhu ${l.temp_celsius}°C`;
  if (l.subtype === "med")
    return `Obat ${[l.med_name, l.med_dose].filter(Boolean).join(" ")}`;
  return l.subtype;
}

export function buildCsvReport({
  baby,
  logs,
  growth,
  milestones,
  immunizations,
}: {
  baby: BabyMeta;
  logs: LogRow[];
  growth: GrowthRow[];
  milestones: ProgressMap;
  immunizations: ProgressMap;
}): string {
  const lines: string[] = [];

  lines.push("=== PROFIL ===");
  lines.push(csvRow(["Nama", baby.name]));
  lines.push(
    csvRow(["Jenis Kelamin", baby.gender === "female" ? "Perempuan" : "Laki-laki"]),
  );
  lines.push(csvRow(["Tanggal Lahir", baby.dob]));
  lines.push(csvRow(["Berat Lahir (kg)", baby.birth_weight_kg]));
  lines.push(csvRow(["Panjang Lahir (cm)", baby.birth_height_cm]));
  lines.push("");

  lines.push("=== PENGUKURAN BB/PB ===");
  lines.push(csvRow(["Tanggal", "Usia (bln)", "BB (kg)", "PB (cm)", "LK (cm)", "Catatan"]));
  lines.push(
    csvRow([fmtDate(baby.dob), 0, baby.birth_weight_kg, baby.birth_height_cm, "", "Saat lahir"]),
  );
  for (const g of growth) {
    lines.push(
      csvRow([
        fmtDate(g.measured_at),
        ageInMonths(baby.dob, new Date(g.measured_at).getTime()).toFixed(1),
        g.weight_kg,
        g.height_cm,
        g.head_circ_cm ?? "",
        g.notes ?? "",
      ]),
    );
  }
  lines.push("");

  lines.push("=== LOG AKTIVITAS ===");
  lines.push(csvRow(["Tanggal", "Waktu", "Jenis", "Detail", "Catatan"]));
  for (const l of logs) {
    const d = new Date(l.timestamp);
    lines.push(
      csvRow([
        d.toLocaleDateString("id-ID"),
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        l.subtype,
        logDetailCsv(l),
        l.notes ?? "",
      ]),
    );
  }
  lines.push("");

  lines.push("=== MILESTONE ===");
  lines.push(csvRow(["Usia", "Milestone", "Tanggal Tercapai"]));
  for (const m of MILESTONES_LIST) {
    const at = milestones.get(m.id);
    lines.push(csvRow([`${m.month} bulan`, m.text, at ? fmtDate(at) : ""]));
  }
  lines.push("");

  lines.push("=== IMUNISASI ===");
  lines.push(csvRow(["Vaksin", "Jadwal", "Tanggal Diberikan"]));
  for (const v of IMUNISASI_LIST) {
    const at = immunizations.get(v.id);
    lines.push(csvRow([v.name, `${v.month} bulan`, at ? fmtDate(at) : ""]));
  }

  return lines.join("\n");
}

// ===================== AI PROMPT BUILDER =====================

export type PromptType =
  | "growth"
  | "feeding-sleep"
  | "diaper"
  | "age-tips"
  | "custom";

const PROMPT_QUESTIONS: Record<PromptType, string> = {
  growth:
    "Bagaimana pertumbuhan Nera dibandingkan referensi WHO? Apakah ada concern yang perlu didiskusikan dengan dokter?",
  "feeding-sleep":
    "Apakah pola makan dan tidur 7 hari terakhir terlihat sehat untuk usia ini? Apa yang bisa di-improve?",
  diaper:
    "Apakah pola pipis dan poop dalam batas normal untuk usia ini? Ada hal yang harus dicermati?",
  "age-tips":
    "Apa saran umum, tips parenting, dan yang harus diperhatikan untuk bayi seusia ini?",
  custom: "",
};

export function buildAiContext({
  baby,
  logs,
  growth,
}: {
  baby: BabyMeta;
  logs: LogRow[];
  growth: GrowthRow[];
}): string {
  const currentAge = ageInMonths(baby.dob);
  const genderLabel = baby.gender === "female" ? "Perempuan" : "Laki-laki";

  const growthLines = [
    `- Lahir (${baby.dob}): ${baby.birth_weight_kg} kg, ${baby.birth_height_cm} cm`,
    ...growth.map(
      (g) =>
        `- ${fmtDate(g.measured_at)} (usia ${ageInMonths(baby.dob, new Date(g.measured_at).getTime()).toFixed(1)} bln): ${g.weight_kg} kg, ${g.height_cm} cm${g.head_circ_cm ? `, LK ${g.head_circ_cm} cm` : ""}`,
    ),
  ].join("\n");

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recent = logs.filter((l) => new Date(l.timestamp).getTime() > sevenDaysAgo);

  const feedingSufor = recent.filter(
    (l) => l.subtype === "feeding" && l.amount_ml != null,
  );
  const feedingDbf = recent.filter(
    (l) =>
      l.subtype === "feeding" &&
      ((l.duration_l_min ?? 0) > 0 || (l.duration_r_min ?? 0) > 0),
  );
  const sleepDone = recent.filter(
    (l) => l.subtype === "sleep" && l.end_timestamp,
  );
  const diaperPee = recent.filter(
    (l) => l.subtype === "diaper" && l.has_pee,
  ).length;
  const diaperPoop = recent.filter(
    (l) => l.subtype === "diaper" && l.has_poop,
  ).length;

  const totalSuforMl = feedingSufor.reduce(
    (s, l) => s + (l.amount_ml ?? 0),
    0,
  );
  const totalDbfMin = feedingDbf.reduce(
    (s, l) => s + (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0),
    0,
  );
  const totalSleepMin = sleepDone.reduce(
    (s, l) =>
      s +
      (new Date(l.end_timestamp!).getTime() -
        new Date(l.timestamp).getTime()) /
        60000,
    0,
  );

  return `DATA BAYI:
- Nama: ${baby.name}
- Jenis Kelamin: ${genderLabel}
- Tanggal Lahir: ${baby.dob}
- Usia Saat Ini: ${currentAge.toFixed(1)} bulan

RIWAYAT PERTUMBUHAN:
${growthLines}

RINGKASAN 7 HARI TERAKHIR:
- Susu (botol): ${feedingSufor.length} sesi, total ${totalSuforMl} ml (rata-rata ${feedingSufor.length ? Math.round(totalSuforMl / 7) : 0} ml/hari)
- DBF: ${feedingDbf.length} sesi, total ${totalDbfMin} menit
- Tidur tercatat: ${sleepDone.length} sesi, total ${(totalSleepMin / 60).toFixed(1)} jam (rata-rata ${(totalSleepMin / 60 / 7).toFixed(1)} jam/hari)
- Ganti diaper: ${diaperPee} pipis, ${diaperPoop} BAB`;
}

export function buildAiPrompt(
  promptType: PromptType,
  context: string,
  customQuestion = "",
): string {
  const question =
    promptType === "custom"
      ? customQuestion.trim() || "Berikan analisis umum dari data ini."
      : PROMPT_QUESTIONS[promptType];

  return `Saya orangtua bayi yang track tumbuh kembang anak via aplikasi. Saya minta analisis berdasarkan data berikut.

Anda adalah asisten parenting yang membantu memahami data tumbuh kembang. Berikan analisis yang berimbang, berbasis fakta, dan ramah dalam Bahasa Indonesia. Sebutkan jika data terbatas. Selalu tegaskan bahwa konsultasi dokter anak diperlukan untuk evaluasi medis. Hindari membuat diagnosis. Jawaban maksimal 300 kata, gunakan paragraf pendek dan bullet jika perlu.

${context}

PERTANYAAN SAYA:
${question}`;
}
