// Verified Indonesian mental health crisis resources.
//
// Verified 2026-05-17 against primary sources:
// - SEJIWA: Kemkes 119 ext 8 (intothelightid.org/tentang-bunuh-diri/hotline-bunuh-diri-di-indonesia/)
// - LISA Helpline: Yayasan Bali Bersama Bisa (bisahelpline.org)
// - Yayasan Pulih: yayasanpulih.org
// - RS Pondok Indah Puri Indah: family hospital (Anda's OB-GYN)
// - Into The Light Indonesia: NOT a hotline — education/advocacy only,
//   surfaced as info-only resource separate from crisis CTAs
//
// Button order rationale: SEJIWA first (government 24/7 phone,
// universally known 119) → LISA (specialized suicide prevention NGO,
// WhatsApp + phone) → RS Pondok Indah (familiar hospital, fastest
// in-person route untuk Jakarta) → partner. Reachability prioritized
// over specialization in acute moment.

export type CrisisResource = {
  id: string;
  /** Display name di UI button */
  name: string;
  /** Short description di UI */
  description: string;
  /** Primary action — tel: / https: / etc. URL scheme */
  primaryUrl: string;
  /** Primary action label */
  primaryLabel: string;
  /** Optional secondary action (kalau ada chat + phone) */
  secondaryUrl?: string;
  secondaryLabel?: string;
  /** Hours info untuk display */
  hours: string;
  emoji: string;
};

export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    id: "sejiwa",
    name: "SEJIWA",
    description: "Layanan kesehatan jiwa Kemenkes",
    primaryUrl: "tel:119",
    primaryLabel: "Hubungi 119 ext 8",
    hours: "24 jam · gratis",
    emoji: "📞",
  },
  {
    id: "lisa",
    name: "LISA Helpline",
    description: "Yayasan Bali Bersama Bisa — suicide prevention",
    primaryUrl: "https://wa.me/628113855472?text=Halo%2C%20saya%20ingin%20berbicara.",
    primaryLabel: "WhatsApp +62 811 3855 472",
    secondaryUrl: "tel:+628113855472",
    secondaryLabel: "Telepon",
    hours: "24 jam · Bahasa Indonesia",
    emoji: "💬",
  },
  {
    id: "rspi-psikiatri",
    name: "RS Pondok Indah · Psikiatri",
    description: "Rumah sakit keluarga · departemen psikiatri",
    primaryUrl: "tel:+62212569 7777",
    primaryLabel: "Telepon (021) 2569 7777",
    hours: "Jam rumah sakit",
    emoji: "🏥",
  },
  {
    id: "yayasan-pulih",
    name: "Yayasan Pulih",
    description: "NGO psikologi — trauma + psikososial",
    primaryUrl: "tel:+622178842580",
    primaryLabel: "Telepon (021) 7884 2580",
    secondaryUrl: "https://yayasanpulih.org",
    secondaryLabel: "Website",
    hours: "Jam kerja",
    emoji: "🤝",
  },
];

/** Educational resource — NOT a crisis hotline, displayed separately. */
export const EDUCATIONAL_RESOURCES = [
  {
    id: "into-the-light",
    name: "Into The Light Indonesia",
    description:
      "Edukasi + advokasi pencegahan bunuh diri. BUKAN hotline.",
    url: "https://intothelightid.org",
  },
];

/**
 * Pre-written WhatsApp message untuk "kirim ke pasangan" button di
 * crisis screen. Direct but not alarming, intentionally vague ("screening"
 * could be any health screening).
 */
export const PARTNER_MESSAGE =
  "Aku baru isi screening dan butuh ngobrol. Bisa kita bicara?";

export function partnerWaUrl(partnerPhoneE164: string | null): string | null {
  if (!partnerPhoneE164) return null;
  // Strip + for wa.me format
  const num = partnerPhoneE164.replace(/[^\d]/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(PARTNER_MESSAGE)}`;
}
