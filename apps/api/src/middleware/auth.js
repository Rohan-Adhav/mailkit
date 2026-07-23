import jwt from "jsonwebtoken";

/**
 * Every protected route hangs off this. It verifies the JWT and attaches
 * req.workspaceId / req.userId. Every single query in the routes layer must
 * filter on req.workspaceId -- that's the whole isolation model. There is no
 * row-level security in Postgres here; the guarantee lives in the app layer,
 * which is why the routes always take the workspace id from the token, never
 * from the request body/params. A body-supplied workspace_id is never trusted.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    req.workspaceId = payload.workspaceId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
