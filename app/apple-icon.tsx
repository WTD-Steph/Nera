import { ImageResponse } from "next/og";

// iOS PWA install icon — 180x180 standard, no border-radius (iOS auto-mask).
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fce7f3 0%, #f9a8d4 55%, #ec4899 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            background: "rgba(255, 252, 254, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 86,
            boxShadow: "inset 0 -6px 14px rgba(244,114,182,0.18)",
          }}
        >
          🍼
        </div>
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 20,
            fontSize: 28,
            display: "flex",
          }}
        >
          ✨
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 22,
            fontSize: 22,
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
