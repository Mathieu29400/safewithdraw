import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
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
            "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
          color: "#022c22",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          borderRadius: 6,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
