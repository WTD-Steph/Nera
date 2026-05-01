import type { MetadataRoute } from "next";

// PWA manifest — Next.js 14 file convention.
// Browser baca kalau ada <link rel="manifest" href="/manifest.webmanifest">.
// Next auto-inject link tag di metadata (app/layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nera — Baby Tracker",
    short_name: "Nera",
    description:
      "Track tumbuh kembang anak: log harian, chart pertumbuhan WHO, milestone, jadwal imunisasi IDAI.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff7f5",
    theme_color: "#f43f5e",
    lang: "id",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
