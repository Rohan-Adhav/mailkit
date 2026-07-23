import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

export const authRouter = Router();

function signToken(user) {
  return jwt.sign(
    { userId: user.id, workspaceId: user.workspace_id },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

authRouter.post("/signup", async (req, res) => {
  const { email, password, workspaceName } = req.body || {};
  if (!email || !password || !workspaceName) {
    return res.status(400).json({ error: "email, password and workspaceName are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const workspace = await client.query(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [workspaceName]
    );
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await client.query(
      `INSERT INTO users (workspace_id, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id, workspace_id, email`,
      [workspace.rows[0].id, email, passwordHash]
    );

    await client.query("COMMIT");
    const token = signToken(user.rows[0]);
    res.status(201).json({ token, user: { id: user.rows[0].id, email: user.rows[0].email } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to sign up" });
  } finally {
    client.release();
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await pool.query(
    "SELECT id, workspace_id, email, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email } });
});
