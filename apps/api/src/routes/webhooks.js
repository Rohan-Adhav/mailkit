import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "../db/pool.js";

export const webhooksRouter = Router();

/**
 * Mailgun signs every webhook payload with an HMAC-SHA256 over timestamp+token,
 * keyed by MAILGUN_WEBHOOK_SIGNING_KEY (found in Settings > Webhooks in the
 * Mailgun dashboard, NOT the same as the API key). We verify it so an outsider
 * can't POST fake "opened" events and inflate another workspace's analytics.
 * This route is intentionally NOT behind requireAuth -- Mailgun calls it directly,
 * it has no user session. The signature check is what stands in for auth here.
 */
function verifySignature(signature) {
  if (!signature) return false;
  const { timestamp, token, signature: sig } = signature;
  const expected = crypto
    .createHmac("sha256", process.env.MAILGUN_WEBHOOK_SIGNING_KEY)
    .update(timestamp + token)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

webhooksRouter.post("/mailgun", async (req, res) => {
  const { signature, "event-data": eventData } = req.body || {};

  if (!verifySignature(signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const eventType = eventData?.event; // "delivered" | "opened" | "failed" | ...
  const messageId = eventData?.message?.headers?.["message-id"]
    ? `<${eventData.message.headers["message-id"]}>`
    : eventData?.["message-id"];

  if (!messageId || !eventType) {
    return res.status(200).json({ ok: true }); // ack anyway, nothing useful to do
  }

  const columnByEvent = { delivered: "delivered_at", opened: "opened_at" };
  const statusByEvent = { delivered: "delivered", opened: "opened", failed: "failed" };

  if (columnByEvent[eventType]) {
    await pool.query(
      `UPDATE campaign_recipients
       SET status = $1, ${columnByEvent[eventType]} = now()
       WHERE provider_message_id = $2
         -- don't downgrade e.g. an "opened" back to "delivered" if events arrive out of order
         AND status != 'opened'`,
      [statusByEvent[eventType], messageId]
    );
  } else if (eventType === "failed") {
    await pool.query(
      `UPDATE campaign_recipients SET status = 'failed' WHERE provider_message_id = $1`,
      [messageId]
    );
  }

  res.status(200).json({ ok: true });
});
