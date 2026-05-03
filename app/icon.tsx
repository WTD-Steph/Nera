import { ImageResponse } from "next/og";

// 192x192 icon untuk PWA + favicon (browser auto-scale untuk favicon size).
export const runtime = "edge";
export const size = { width: 192, height: 192 };
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
          background: "linear-gradient(135deg, #fce7f3 0%, #f9a8d4 55%, #ec4899 100%)",
          borderRadius: 38,
          position: "relative",
        }}
      >
        {/* Soft white inner halo for contrast */}
        <div
          style={{
            width: 138,
            height: 138,
            borderRadius: "50%",
            background: "rgba(255, 252, 254, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 92,
            boxShadow: "inset 0 -6px 14px rgba(244,114,182,0.18)",
          }}
        >
          🍼
        </div>
        {/* Sparkle accent top-right */}
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 22,
            fontSize: 30,
            display: "flex",
          }}
        >
          ✨
        </div>
        {/* Heart accent bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: 24,
            fontSize: 24,
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
