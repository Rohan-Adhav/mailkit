import { pool } from "../db/pool.js";
import { sendEmail } from "./mailer.js";

/**
 * Sends every pending recipient of a campaign and records the outcome.
 */
export async function sendCampaign(campaignId) {

  console.log(`[campaign] Starting campaign: ${campaignId}`);

  const { rows: campaignRows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1",
    [campaignId]
  );

  const campaign = campaignRows[0];

  if (!campaign) {
    console.error(`[campaign] Campaign not found: ${campaignId}`);
    throw new Error(`Campaign ${campaignId} not found`);
  }


  console.log("[campaign] Details:");
  console.log({
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    status: campaign.status
  });


  await pool.query(
    "UPDATE campaigns SET status = 'sending', updated_at = now() WHERE id = $1",
    [campaignId]
  );


  const { rows: recipients } = await pool.query(
    `SELECT * FROM campaign_recipients
     WHERE campaign_id = $1 
     AND matched = true 
     AND status = 'pending'`,
    [campaignId]
  );


  console.log(
    `[campaign] Total recipients found: ${recipients.length}`
  );


  let failures = 0;


  for (const recipient of recipients) {

    console.log("[mail] Sending to:", recipient.email);


    try {

      const messageId = await sendEmail({
        to: recipient.email,
        subject: campaign.subject,
        html: campaign.body,
      });


      console.log(
        "[mail] Mailgun success:",
        {
          email: recipient.email,
          messageId
        }
      );


      await pool.query(
        `UPDATE campaign_recipients
         SET status = 'sent',
             provider_message_id = $1,
             sent_at = now()
         WHERE id = $2`,
        [messageId, recipient.id]
      );


      console.log(
        `[db] Recipient marked sent: ${recipient.email}`
      );


    } catch (err) {

      failures++;

      console.error(
        "[mail] FAILED:",
        recipient.email
      );

      console.error(err);


      await pool.query(
        `UPDATE campaign_recipients 
         SET status = 'failed',
             error = $1 
         WHERE id = $2`,
        [
          String(err.message || err),
          recipient.id
        ]
      );


      console.log(
        `[db] Recipient marked failed: ${recipient.email}`
      );
    }
  }



  const finalStatus =
    failures === recipients.length && recipients.length > 0
      ? "failed"
      : "sent";


  await pool.query(
    `UPDATE campaigns 
     SET status = $1,
         sent_at = now(),
         updated_at = now()
     WHERE id = $2`,
    [
      finalStatus,
      campaignId
    ]
  );


  console.log(
    `[campaign] Completed ${campaignId} => ${finalStatus}`
  );
}