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
  console.log("========== MAILGUN WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const { signature, "event-data": eventData } = req.body || {};

  if (!verifySignature(signature)) {
    console.log("Invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  console.log("Signature verified");

  const eventType = eventData?.event;

  const messageId = eventData?.message?.headers?.["message-id"]
    ? `<${eventData.message.headers["message-id"]}>`
    : eventData?.["message-id"];

  console.log("Event:", eventType);
  console.log("Message ID:", messageId);

  if (!messageId || !eventType) {
    console.log("Missing event or message id");
    return res.status(200).json({ ok: true });
  }

  const columnByEvent = {
    delivered: "delivered_at",
    opened: "opened_at",
  };

  const statusByEvent = {
    delivered: "delivered",
    opened: "opened",
    failed: "failed",
  };

  if (columnByEvent[eventType]) {
    const result = await pool.query(
      `UPDATE campaign_recipients
       SET status = $1,
           ${columnByEvent[eventType]} = now()
       WHERE provider_message_id = $2
       AND status != 'opened'`,
      [statusByEvent[eventType], messageId]
    );

    console.log(
      `Updated ${result.rowCount} row(s) for ${eventType}`
    );
  } else if (eventType === "failed") {
    const result = await pool.query(
      `UPDATE campaign_recipients
       SET status = 'failed'
       WHERE provider_message_id = $1`,
      [messageId]
    );

    console.log(
      `Updated ${result.rowCount} failed row(s)`
    );
  }

  res.status(200).json({ ok: true });
});
