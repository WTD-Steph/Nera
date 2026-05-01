// Jadwal imunisasi rekomendasi IDAI 0–12 bulan.
// Source: artifact prototype + IDAI 2017 schedule (subset 0–12 bulan).
// id stable — jangan di-rename; pair dengan immunization_progress.vaccine_key.

export type Vaccine = {
  id: string;
  name: string;
  month: number;
};

export const IMUNISASI_LIST: Vaccine[] = [
  { id: "hb0", name: "Hepatitis B-0", month: 0 },
  { id: "bcg", name: "BCG", month: 1 },
  { id: "opv1", name: "Polio (OPV) 1", month: 1 },
  { id: "dpt1", name: "DPT-HB-Hib 1", month: 2 },
  { id: "opv2", name: "Polio (OPV) 2", month: 2 },
  { id: "pcv1", name: "PCV 1", month: 2 },
  { id: "rota1", name: "Rotavirus 1", month: 2 },
  { id: "dpt2", name: "DPT-HB-Hib 2", month: 3 },
  { id: "opv3", name: "Polio (OPV) 3", month: 3 },
  { id: "pcv2", name: "PCV 2", month: 3 },
  { id: "rota2", name: "Rotavirus 2", month: 3 },
  { id: "dpt3", name: "DPT-HB-Hib 3", month: 4 },
  { id: "opv4", name: "Polio (OPV) 4", month: 4 },
  { id: "ipv", name: "IPV", month: 4 },
  { id: "pcv3", name: "PCV 3", month: 4 },
  { id: "rota3", name: "Rotavirus 3", month: 4 },
  { id: "flu1", name: "Influenza", month: 6 },
  { id: "mr", name: "MR / Campak", month: 9 },
  { id: "je", name: "Japanese Encephalitis", month: 9 },
  { id: "varisela", name: "Varisela", month: 12 },
  { id: "hepa1", name: "Hepatitis A", month: 12 },
];
