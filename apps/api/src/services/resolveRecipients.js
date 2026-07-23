import { pool } from "../db/pool.js";
import { filterToSql } from "./audienceFilter.js";
import { normalizeEmail, normalizePhone } from "./dedupe.js";

/**
 * Mode "audience": pull every contact matching a saved audience's filter,
 * or every contact carrying a given tag (a quick "audience of one filter").
 *
 * Mode "manual": the user pasted a block of emails/phones. Each line is
 * looked up against saved contacts (by email or phone). Matches carry the
 * contact's name along for the sanity-check UI; anything that doesn't match
 * any contact is still included as an unmatched/flagged recipient (matched:
 * false) rather than silently dropped, on the assumption the user typed a
 * real email/phone they still want to reach, they just don't have it saved.
 * A raw phone number with no matching contact has no address to email, so
 * that case is flagged and excluded from sending, not just from matching.
 */
export async function resolveRecipients(workspaceId, { mode, audienceId, tag, manualList }) {
  if (mode === "audience") {
    let filter;
    if (audienceId) {
      const { rows } = await pool.query(
        "SELECT filter FROM audiences WHERE id = $1 AND workspace_id = $2",
        [audienceId, workspaceId]
      );
      if (!rows[0]) throw new Error("Audience not found");
      filter = rows[0].filter;
    } else if (tag) {
      filter = { tag };
    } else {
      throw new Error("audienceId or tag is required for mode=audience");
    }

    const { clause, params } = filterToSql(filter, workspaceId);
    const { rows } = await pool.query(
      `SELECT id, name, email, phone FROM contacts WHERE ${clause}`,
      params
    );
    return rows
      .filter((c) => c.email) // can only email people who have an email on file
      .map((c) => ({ contactId: c.id, name: c.name, email: c.email, matched: true }));
  }

  if (mode === "manual") {
    const lines = (manualList || [])
      .map((l) => l.trim())
      .filter(Boolean);

    const results = [];
    for (const raw of lines) {
      const looksLikeEmail = raw.includes("@");
      const email = looksLikeEmail ? normalizeEmail(raw) : null;
      const phone = !looksLikeEmail ? normalizePhone(raw) : null;

      const { rows } = await pool.query(
        `SELECT id, name, email, phone FROM contacts
         WHERE workspace_id = $1 AND (
           ($2::text IS NOT NULL AND email = $2) OR
           ($3::text IS NOT NULL AND phone = $3)
         ) LIMIT 1`,
        [workspaceId, email, phone]
      );
      const contact = rows[0];

      if (contact && contact.email) {
        results.push({ contactId: contact.id, name: contact.name, email: contact.email, matched: true });
      } else {
        // no saved contact -- if it was itself an email address we can still
        // send to it, just flagged as unmatched/unverified; a bare phone
        // number with no matching contact has nothing to send to.
        results.push({
          contactId: null,
          name: null,
          email: email || null,
          matched: false,
          raw,
        });
      }
    }
    return results;
  }

  throw new Error(`Unknown recipient mode: ${mode}`);
}
