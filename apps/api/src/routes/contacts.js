import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  findDuplicate,
  normalizeEmail,
  normalizePhone,
} from "../services/dedupe.js";

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const FIXED_FIELDS = new Set([
  "name",
  "email",
  "phone",
]);

function splitCustomFields(row) {
  const custom = {};

  for (const [key, value] of Object.entries(row)) {
    if (FIXED_FIELDS.has(key)) continue;

    if (
      value === undefined ||
      value === ""
    )
      continue;

    if (
      key === "tags" ||
      key === "tag"
    ) {
      custom.tags = String(value)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else {
      custom[key] = value;
    }
  }

  return custom;
}

// GET ALL CONTACTS
contactsRouter.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        phone,
        custom_fields,
        created_at,
        updated_at
      FROM contacts
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      `,
      [req.workspaceId]
    );

    res.json({
      contacts: rows,
    });
  } catch (err) {
    console.error(
      "GET contacts error:",
      err
    );

    res.status(500).json({
      error: "Failed fetching contacts",
    });
  }
});

// CREATE CONTACT
contactsRouter.post("/", async (req, res) => {
  const {
    name,
    email: rawEmail,
    phone: rawPhone,
    custom_fields,
  } = req.body || {};

  const email = normalizeEmail(rawEmail);
  const phone = normalizePhone(rawPhone);

  if (!email && !phone) {
    return res.status(400).json({
      error:
        "A contact needs at least email or phone",
    });
  }

  let client;

  try {
    client = await pool.connect();

    const duplicate = await findDuplicate(
      client,
      req.workspaceId,
      {
        email,
        phone,
      }
    );

    if (duplicate) {
      return res.status(409).json({
        error: "Duplicate contact",
        existing: duplicate,
      });
    }

    const { rows } = await client.query(
      `
      INSERT INTO contacts
      (
        workspace_id,
        name,
        email,
        phone,
        custom_fields
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        req.workspaceId,
        name || null,
        email,
        phone,
        custom_fields || {},
      ]
    );

    res.status(201).json({
      contact: rows[0],
    });
  } catch (err) {
    console.error(
      "CREATE contact error:",
      err
    );

    res.status(500).json({
      error: "Database error",
    });
  } finally {
    if (client) client.release();
  }
});

// UPDATE CONTACT
contactsRouter.put("/:id", async (req, res) => {
  const {
    name,
    email: rawEmail,
    phone: rawPhone,
    custom_fields,
  } = req.body || {};

  const email = normalizeEmail(rawEmail);
  const phone = normalizePhone(rawPhone);

  let client;

  try {
    client = await pool.connect();

    const owns = await client.query(
      `
      SELECT id
      FROM contacts
      WHERE id = $1
      AND workspace_id = $2
      `,
      [
        req.params.id,
        req.workspaceId,
      ]
    );

    if (!owns.rowCount) {
      return res.status(404).json({
        error: "Not found",
      });
    }

    const duplicate = await client.query(
      `
      SELECT id
      FROM contacts
      WHERE workspace_id = $1
      AND id != $2
      AND
      (
        email = $3
        OR
        phone = $4
      )
      `,
      [
        req.workspaceId,
        req.params.id,
        email,
        phone,
      ]
    );

    if (duplicate.rows.length) {
      return res.status(409).json({
        error:
          "Another contact already has this email or phone",
      });
    }

    const { rows } = await client.query(
      `
      UPDATE contacts
      SET
        name = $1,
        email = $2,
        phone = $3,
        custom_fields = $4,
        updated_at = now()
      WHERE id = $5
      AND workspace_id = $6
      RETURNING *
      `,
      [
        name || null,
        email,
        phone,
        custom_fields || {},
        req.params.id,
        req.workspaceId,
      ]
    );

    res.json({
      contact: rows[0],
    });
  } catch (err) {
    console.error(
      "UPDATE contact error:",
      err
    );

    res.status(500).json({
      error: "Database error",
    });
  } finally {
    if (client) client.release();
  }
});

// DELETE CONTACT
contactsRouter.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      DELETE FROM contacts
      WHERE id = $1
      AND workspace_id = $2
      `,
      [
        req.params.id,
        req.workspaceId,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Not found",
      });
    }

    res.status(204).end();
  } catch (err) {
    console.error(
      "DELETE contact error:",
      err
    );

    res.status(500).json({
      error: "Database error",
    });
  }
});

// CSV IMPORT
contactsRouter.post(
  "/import",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "No CSV file uploaded",
      });
    }

    let records;

    try {
      records = parse(
        req.file.buffer,
        {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }
      );
    } catch (err) {
      return res.status(400).json({
        error: "CSV parse failed",
      });
    }

    let client;
    let added = 0;
    let skipped = 0;
    const errors = [];

    const seenEmails = new Set();
    const seenPhones = new Set();

    try {
      client = await pool.connect();

      await client.query("BEGIN");

      for (const [index, row] of records.entries()) {
        const email = normalizeEmail(row.email);
        const phone = normalizePhone(row.phone);

        if (!email && !phone) {
          errors.push(
            `Row ${index + 2}: missing email/phone`
          );

          skipped++;
          continue;
        }

        if (
          (email && seenEmails.has(email)) ||
          (phone && seenPhones.has(phone))
        ) {
          skipped++;
          continue;
        }

        const duplicate = await findDuplicate(
          client,
          req.workspaceId,
          {
            email,
            phone,
          }
        );

        if (duplicate) {
          skipped++;
          continue;
        }

        await client.query(
          `
          INSERT INTO contacts
          (
            workspace_id,
            name,
            email,
            phone,
            custom_fields
          )
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            req.workspaceId,
            row.name || null,
            email,
            phone,
            splitCustomFields(row),
          ]
        );

        if (email) seenEmails.add(email);
        if (phone) seenPhones.add(phone);

        added++;
      }

      await client.query("COMMIT");

      res.json({
        added,
        skipped,
        total: records.length,
        message: `${added} added, ${skipped} skipped as duplicates`,
        errors,
      });
    } catch (err) {
      if (client) {
        await client.query("ROLLBACK");
      }

      console.error(
        "IMPORT ERROR",
        err
      );

      res.status(500).json({
        error: "Import failed",
      });
    } finally {
      if (client) client.release();
    }
  }
);