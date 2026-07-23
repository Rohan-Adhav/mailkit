import { pool } from "../db/pool.js";

/**
 * A contact is considered a duplicate of an existing one in the same workspace
 * if it shares an email OR a phone number with a row already in the table.
 * We look up by whichever of those two fields is present on the incoming
 * record and return the first match, if any. Skip vs merge is a judgement
 * call the assessment leaves open; we skip and surface a count so nothing
 * silently piles up ("15 added, 3 skipped as duplicates").
 */
export async function findDuplicate(client, workspaceId, { email, phone }) {
  if (!email && !phone) return null;

  const conditions = [];
  const values = [workspaceId];

  if (email) {
    values.push(email);
    conditions.push(`email = $${values.length}`);
  }
  if (phone) {
    values.push(phone);
    conditions.push(`phone = $${values.length}`);
  }

  const { rows } = await client.query(
    `SELECT id, name, email, phone FROM contacts
     WHERE workspace_id = $1 AND (${conditions.join(" OR ")})
     LIMIT 1`,
    values
  );
  return rows[0] || null;
}

export function normalizeEmail(email) {
  return email ? email.trim().toLowerCase() : null;
}

export function normalizePhone(phone) {
  if (!phone) return null;
  // keep leading + but strip everything else non-numeric so "+91 98765 43210"
  // and "+919876543210" are recognized as the same number
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}
