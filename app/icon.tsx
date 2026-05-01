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
          background: "linear-gradient(135deg, #fda4af 0%, #f472b6 100%)",
          borderRadius: 32,
          fontSize: 120,
        }}
      >
        👶
      </div>
    ),
    size,
  );
}
