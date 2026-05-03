import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `Paddle-Signature` header for Paddle Billing webhooks.
 * @see https://developer.paddle.com/webhooks/signature-verification
 */
export function verifyPaddleWebhookSignature(
  rawBody: Buffer,
  paddleSignatureHeader: string | null,
  secret: string,
  maxAgeSeconds = 300,
): boolean {
  if (!paddleSignatureHeader || !secret) return false;

  let ts: string | null = null;
  let h1: string | null = null;
  for (const part of paddleSignatureHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    if (key === "h1") h1 = value;
  }
  if (!ts || !h1) return false;

  const tsNum = Number.parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > maxAgeSeconds) return false;

  const signedPayload = `${ts}:${rawBody.toString("utf8")}`;
  const expectedHex = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, "hex"),
      Buffer.from(h1, "hex"),
    );
  } catch {
    return false;
  }
}
