import { ImageResponse } from "next/og";

export const alt =
  "SafeWithdraw — Sache exactement combien tu peux te verser, à tout moment.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.28), rgba(2,6,23,0) 70%), #020617",
          color: "#f1f5f9",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
              boxShadow: "0 12px 30px -12px rgba(16,185,129,0.7)",
            }}
          />
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            SafeWithdraw
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 70,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#f8fafc",
              maxWidth: 1000,
            }}
          >
            Sache exactement combien tu peux te verser, à tout moment.
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#cbd5e1",
              lineHeight: 1.3,
              maxWidth: 980,
            }}
          >
            Calcul URSSAF automatique. Réserve de sécurité incluse. Pour
            freelances et auto-entrepreneurs.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 22px",
                borderRadius: 999,
                background: "rgba(16,185,129,0.12)",
                color: "#a7f3d0",
                fontSize: 22,
                fontWeight: 500,
                border: "1px solid rgba(16,185,129,0.35)",
              }}
            >
              Essai gratuit 30 jours · sans carte
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
