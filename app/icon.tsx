import { ImageResponse } from "next/og";

// Master PWA icon — 512x512 untuk Android splash screen sharpness +
// Chrome installer + favicon. Browser auto-scale untuk size kecil.
// Sebelumnya 192x192 → splash blur di Android karena upscaling.
export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #fce7f3 0%, #f9a8d4 55%, #ec4899 100%)",
          borderRadius: 102,
          position: "relative",
        }}
      >
        {/* Soft white inner halo for contrast — sized so kontennya stays
            di safe zone (80% center) untuk maskable mask. */}
        <div
          style={{
            width: 368,
            height: 368,
            borderRadius: "50%",
            background: "rgba(255, 252, 254, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 246,
            boxShadow: "inset 0 -16px 38px rgba(244,114,182,0.18)",
          }}
        >
          🍼
        </div>
        {/* Sparkle accent top-right (decorative — di luar safe zone,
            akan ke-clip kalau di-mask, that's fine) */}
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 58,
            fontSize: 80,
            display: "flex",
          }}
        >
          ✨
        </div>
        {/* Heart accent bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: 58,
            left: 64,
            fontSize: 64,
            display: "flex",
          }}
        >
          💗
        </div>
      </div>
    ),
    size,
  );
}
