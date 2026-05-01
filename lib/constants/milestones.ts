// KPSP/IDAI milestone checklist 0–12 bulan.
// Source: artifact prototype Stephanus + IDAI rekomendasi.
// id stable — jangan di-rename setelah ada data; id pair dengan
// milestone_progress.milestone_key.

export type Milestone = {
  id: string;
  month: number;
  text: string;
};

export const MILESTONES_LIST: Milestone[] = [
  { id: "m1a", month: 1, text: "Mengangkat kepala sebentar saat tengkurap" },
  { id: "m1b", month: 1, text: "Bereaksi terhadap suara/cahaya" },
  { id: "m1c", month: 1, text: "Menatap wajah pengasuh" },
  { id: "m2a", month: 2, text: "Senyum sosial" },
  { id: "m2b", month: 2, text: 'Mengoceh — suara seperti "ah/uh"' },
  { id: "m2c", month: 2, text: "Mengikuti gerak benda dengan mata" },
  { id: "m3a", month: 3, text: "Mengangkat kepala 45° saat tengkurap" },
  { id: "m3b", month: 3, text: "Menggenggam mainan yang diberikan" },
  { id: "m3c", month: 3, text: "Mengangkat kepala tegak saat ditegakkan" },
  { id: "m4a", month: 4, text: "Tertawa keras" },
  { id: "m4b", month: 4, text: "Berbalik tengkurap–telentang" },
  { id: "m4c", month: 4, text: "Memperhatikan tangannya sendiri" },
  { id: "m5a", month: 5, text: "Meraih dan menggenggam benda dengan tepat" },
  { id: "m5b", month: 5, text: "Memasukkan benda ke mulut" },
  { id: "m6a", month: 6, text: "Duduk dengan bantuan" },
  { id: "m6b", month: 6, text: 'Mengoceh "ba/da/pa"' },
  { id: "m6c", month: 6, text: "Mengenali wajah orang dekat" },
  { id: "m6d", month: 6, text: "Siap memulai MPASI" },
  { id: "m7a", month: 7, text: "Duduk sendiri sebentar tanpa bantuan" },
  { id: "m7b", month: 7, text: "Memindahkan benda dari tangan ke tangan" },
  { id: "m8a", month: 8, text: "Merangkak / ngesot" },
  { id: "m8b", month: 8, text: 'Mengucap "mama/dada/papa" tanpa arti' },
  { id: "m9a", month: 9, text: "Berdiri dengan pegangan" },
  { id: "m9b", month: 9, text: "Melambai / dadah" },
  { id: "m9c", month: 9, text: "Bermain ciluk-ba" },
  { id: "m10a", month: 10, text: "Berjalan rambatan" },
  { id: "m10b", month: 10, text: "Mengambil benda kecil dengan jepitan jari" },
  { id: "m11a", month: 11, text: "Berdiri sendiri sebentar" },
  { id: "m11b", month: 11, text: "Mengucap kata pertama yang bermakna" },
  { id: "m12a", month: 12, text: "Berjalan dengan/tanpa bantuan" },
  { id: "m12b", month: 12, text: "Minum dari gelas" },
  { id: "m12c", month: 12, text: "Menunjuk benda yang diinginkan" },
];
