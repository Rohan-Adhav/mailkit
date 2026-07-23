import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { contactsRouter } from "./routes/contacts.js";
import { audiencesRouter } from "./routes/audiences.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { webhooksRouter } from "./routes/webhooks.js";

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(","),
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/audiences", audiencesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/webhooks", webhooksRouter); // no /api prefix, easier to point Mailgun at

// last-resort error handler so an unexpected throw doesn't crash the process
// with a stack trace visible to the client
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
