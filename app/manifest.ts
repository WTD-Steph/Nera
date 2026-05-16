import type { MetadataRoute } from "next";

// PWA manifest — Next.js 14 file convention.
// Browser baca kalau ada <link rel="manifest" href="/manifest.webmanifest">.
// Next auto-inject link tag di metadata (app/layout.tsx).
//
// ICON_VERSION bump: tambahin ?v=N di src icon URLs supaya Android &
// Chromium re-fetch ikon waktu manifest update. Tanpa ini, browser
// keep icon yang sudah di-cache walaupun /icon endpoint return PNG baru.
// Bump angka ini setiap kali design icon berubah.
const ICON_VERSION = 3;

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` (PWA app identity) — kalau di-bump, Android perlakuin sebagai
    // app baru, force replace icon di home screen. Stable sampai design
    // icon di-overhaul.
    id: `/?v=${ICON_VERSION}`,
    name: "Nera — Baby Tracker",
    short_name: "Nera",
    description:
      "Track tumbuh kembang anak: log harian, chart pertumbuhan WHO, milestone, jadwal imunisasi IDAI.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fff7f5",
    theme_color: "#f43f5e",
    lang: "id",
    icons: [
      // 512x512 source — Android splash screen + high-DPI installer
      // pakai size ini supaya tajam (splash di-upscale dari icon
      // terbesar, sebelumnya 192px → blur).
      {
        src: `/icon?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      // 192x192 alias — beberapa browser mau size ini explicit untuk
      // home screen icon (Chrome auto-scale dari 512 sebenarnya OK
      // tapi list ini bantu compatibility).
      {
        src: `/icon?v=${ICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/apple-icon?v=${ICON_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
