import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { filterToSql } from "../services/audienceFilter.js";

export const audiencesRouter = Router();
audiencesRouter.use(requireAuth);

audiencesRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, filter, created_at FROM audiences WHERE workspace_id = $1 ORDER BY created_at DESC",
    [req.workspaceId]
  );

  // attach a live member count for each -- cheap enough at take-home scale
  const withCounts = await Promise.all(
    rows.map(async (a) => {
      const { clause, params } = filterToSql(a.filter, req.workspaceId);
      const { rows: countRows } = await pool.query(
        `SELECT count(*) FROM contacts WHERE ${clause}`,
        params
      );
      return { ...a, memberCount: Number(countRows[0].count) };
    })
  );

  res.json({ audiences: withCounts });
});

// preview count for a not-yet-saved filter, used by the "new audience" UI
audiencesRouter.post("/preview", async (req, res) => {
  const { filter } = req.body || {};
  const { clause, params } = filterToSql(filter, req.workspaceId);
  const { rows } = await pool.query(`SELECT count(*) FROM contacts WHERE ${clause}`, params);
  res.json({ memberCount: Number(rows[0].count) });
});

audiencesRouter.post("/", async (req, res) => {
  const { name, filter } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const { rows } = await pool.query(
    "INSERT INTO audiences (workspace_id, name, filter) VALUES ($1, $2, $3) RETURNING *",
    [req.workspaceId, name, filter || {}]
  );
  res.status(201).json({ audience: rows[0] });
});

audiencesRouter.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM audiences WHERE id = $1 AND workspace_id = $2",
    [req.params.id, req.workspaceId]
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});
