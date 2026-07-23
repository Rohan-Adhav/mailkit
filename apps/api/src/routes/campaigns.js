import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveRecipients } from "../services/resolveRecipients.js";
import { scheduleCampaignSend, cancelCampaignSend } from "../queue/campaignQueue.js";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

// Preview recipients before creating the campaign, so the "paste a list" UI
// can show matched names / flag unmatched entries before the user commits.
campaignsRouter.post("/preview-recipients", async (req, res) => {
  try {
    const recipients = await resolveRecipients(req.workspaceId, req.body || {});
    res.json({
      recipients,
      matchedCount: recipients.filter((r) => r.matched).length,
      unmatchedCount: recipients.filter((r) => !r.matched).length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

campaignsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*,
       (SELECT count(*) FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.matched) AS recipient_count
     FROM campaigns c WHERE c.workspace_id = $1 ORDER BY c.created_at DESC`,
    [req.workspaceId]
  );
  res.json({ campaigns: rows });
});

campaignsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  const { rows: recipients } = await pool.query(
    "SELECT id, name, email, matched, status, sent_at, delivered_at, opened_at FROM campaign_recipients WHERE campaign_id = $1 ORDER BY name",
    [req.params.id]
  );
  res.json({ campaign: rows[0], recipients });
});

campaignsRouter.get("/:id/analytics", async (req, res) => {
  const owns = await pool.query(
    "SELECT status FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (!owns.rows[0]) return res.status(404).json({ error: "Not found" });

  const { rows } = await pool.query(
    `SELECT status, count(*) FROM campaign_recipients
     WHERE campaign_id = $1 AND matched = true GROUP BY status`,
    [req.params.id]
  );
  const counts = { pending: 0, sent: 0, delivered: 0, opened: 0, failed: 0 };
  for (const r of rows) counts[r.status] = Number(r.count);

  res.json({
    campaignStatus: owns.rows[0].status,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    sent: counts.sent + counts.delivered + counts.opened,
    delivered: counts.delivered + counts.opened,
    opened: counts.opened,
    failed: counts.failed,
    pending: counts.pending,
  });
});

// Creates a draft campaign and materializes its recipient list right away
// (so the "who's about to get this" view is stable even if the underlying
// audience changes before send time).
campaignsRouter.post("/", async (req, res) => {
  const { name, subject, body, recipientMode, audienceId, tag, manualList } = req.body || {};
  if (!name || !subject || !body || !recipientMode) {
    return res.status(400).json({ error: "name, subject, body and recipientMode are required" });
  }

  let recipients;
  try {
    recipients = await resolveRecipients(req.workspaceId, { mode: recipientMode, audienceId, tag, manualList });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO campaigns (workspace_id, name, subject, body, recipient_mode, audience_id, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.workspaceId, name, subject, body, recipientMode, audienceId || null, tag || null]
    );
    const campaign = rows[0];

    for (const r of recipients) {
      await client.query(
        `INSERT INTO campaign_recipients (campaign_id, workspace_id, contact_id, email, name, matched, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [campaign.id, req.workspaceId, r.contactId, r.email, r.name, r.matched, r.matched ? "pending" : "failed"]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      campaign,
      matchedCount: recipients.filter((r) => r.matched).length,
      unmatchedCount: recipients.filter((r) => !r.matched).length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create campaign" });
  } finally {
    client.release();
  }
});

campaignsRouter.post("/:id/send-now", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].status !== "draft") {
    return res.status(400).json({ error: `Campaign is already ${rows[0].status}` });
  }

  // still goes through the queue (delay 0) rather than sending inline in the
  // request handler, so a big recipient list can't time out the HTTP request
  await scheduleCampaignSend(req.params.id, new Date());
  await pool.query("UPDATE campaigns SET status = 'scheduled', scheduled_at = now() WHERE id = $1", [
    req.params.id,
  ]);
  res.json({ ok: true });
});

campaignsRouter.post("/:id/schedule", async (req, res) => {
  const { sendAt } = req.body || {};
  if (!sendAt) return res.status(400).json({ error: "sendAt is required (ISO timestamp)" });
  if (new Date(sendAt).getTime() <= Date.now()) {
    return res.status(400).json({ error: "sendAt must be in the future" });
  }

  const { rows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].status !== "draft" && rows[0].status !== "scheduled") {
    return res.status(400).json({ error: `Campaign is already ${rows[0].status}` });
  }

  if (rows[0].status === "scheduled") {
    await cancelCampaignSend(req.params.id); // re-scheduling: drop the old delayed job first
  }

  await scheduleCampaignSend(req.params.id, sendAt);
  await pool.query(
    "UPDATE campaigns SET status = 'scheduled', scheduled_at = $1, updated_at = now() WHERE id = $2",
    [sendAt, req.params.id]
  );
  res.json({ ok: true, scheduledAt: sendAt });
});

campaignsRouter.post("/:id/cancel", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT status FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].status !== "scheduled") {
    return res.status(400).json({ error: "Only scheduled campaigns can be cancelled" });
  }
  await cancelCampaignSend(req.params.id);
  await pool.query("UPDATE campaigns SET status = 'draft', scheduled_at = NULL WHERE id = $1", [
    req.params.id,
  ]);
  res.json({ ok: true });
});

// Extra-credit: duplicate a campaign's content and recipient list into a fresh draft
campaignsRouter.post("/:id/duplicate", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  const original = rows[0];
  if (!original) return res.status(404).json({ error: "Not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: newRows } = await client.query(
      `INSERT INTO campaigns (workspace_id, name, subject, body, recipient_mode, audience_id, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.workspaceId,
        `${original.name} (copy)`,
        original.subject,
        original.body,
        original.recipient_mode,
        original.audience_id,
        original.tag,
      ]
    );
    const copy = newRows[0];

    await client.query(
      `INSERT INTO campaign_recipients (campaign_id, workspace_id, contact_id, email, name, matched, status)
       SELECT $1, workspace_id, contact_id, email, name, matched, 'pending'
       FROM campaign_recipients WHERE campaign_id = $2`,
      [copy.id, original.id]
    );

    await client.query("COMMIT");
    res.status(201).json({ campaign: copy });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to duplicate campaign" });
  } finally {
    client.release();
  }
});
