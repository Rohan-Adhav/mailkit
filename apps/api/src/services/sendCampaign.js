import { pool } from "../db/pool.js";
import { sendEmail } from "./mailer.js";

/**
 * Sends every pending recipient of a campaign and records the outcome.
 * Called by the BullMQ worker for scheduled campaigns, and directly (with
 * delay: 0, still going through the queue -- see routes/campaigns.js) for
 * "send now" campaigns, so both paths share one code path and one set of
 * failure semantics.
 */
export async function sendCampaign(campaignId) {
  const { rows: campaignRows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1",
    [campaignId]
  );
  const campaign = campaignRows[0];
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  await pool.query("UPDATE campaigns SET status = 'sending', updated_at = now() WHERE id = $1", [
    campaignId,
  ]);

  const { rows: recipients } = await pool.query(
    `SELECT * FROM campaign_recipients
     WHERE campaign_id = $1 AND matched = true AND status = 'pending'`,
    [campaignId]
  );

  let failures = 0;
  for (const recipient of recipients) {
    try {
      const messageId = await sendEmail({
        to: recipient.email,
        subject: campaign.subject,
        html: campaign.body,
      });
      await pool.query(
        `UPDATE campaign_recipients
         SET status = 'sent', provider_message_id = $1, sent_at = now()
         WHERE id = $2`,
        [messageId, recipient.id]
      );
    } catch (err) {
      failures++;
      await pool.query(
        `UPDATE campaign_recipients SET status = 'failed', error = $1 WHERE id = $2`,
        [String(err.message || err), recipient.id]
      );
    }
  }

  await pool.query(
    `UPDATE campaigns SET status = $1, sent_at = now(), updated_at = now() WHERE id = $2`,
    [failures === recipients.length && recipients.length > 0 ? "failed" : "sent", campaignId]
  );
}
