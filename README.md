# MailKit

A small multi-tenant email marketing app: contacts → audiences → campaigns → send →
track opens. Built for the take-home brief: Next.js frontend, Express API,
Postgres, and Redis/BullMQ for scheduled sends.

## Monorepo layout

```
mailkit/
  apps/
    api/            Express API (auth, contacts, audiences, campaigns, webhooks)
      src/
        routes/       one file per resource
        services/     dedupe, CSV parsing, recipient matching, Mailgun client, send logic
        queue/         BullMQ queue + the worker process that actually sends mail
        db/            pg pool, migration runner
      migrations/     plain SQL, applied in order by src/db/migrate.js
    web/            Next.js (App Router) frontend, talks to the API over fetch + JWT
  docker-compose.yml  local Postgres + Redis
  .env.example        every env var the API and web app read
```

The frontend and backend are fully separate processes (no Next.js API routes
are used for app logic) so `apps/web` could be deployed to Vercel and
`apps/api` to a Node host independently, which is how I actually deployed it.

## Running it locally

You'll need Node 18+, and Docker (or your own local Postgres 16 + Redis 7).

```bash
# 1. infra
docker compose up -d

# 2. install deps (npm workspaces, one install for both apps)
npm install

# 3. env vars
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local   # only NEXT_PUBLIC_API_URL matters here
# then fill in MAILGUN_* and JWT_SECRET in apps/api/.env

# 4. create the schema
npm run migrate

# 5. run all three processes (separate terminals)
npm run dev:api      # Express on :4000
npm run dev:worker   # BullMQ worker -- this is what actually sends scheduled mail
npm run dev:web      # Next.js on :3000
```

Then visit `http://localhost:3000`, sign up (this creates your workspace),
and go.

### Wiring up Mailgun (free, no domain needed)

1. Create a Mailgun account, use the sandbox domain it gives you for free —
   no DNS records required.
2. Under **Sending → Authorized Recipients**, add up to 5 email addresses
   you control and verify them. Sandbox domains can only send to verified
   addresses, which is plenty for testing this app.
3. Copy the sandbox domain and your private API key into `apps/api/.env`
   (`MAILGUN_DOMAIN`, `MAILGUN_API_KEY`).
4. Under **Sending → Webhooks**, copy the **HTTP webhook signing key** into
   `MAILGUN_WEBHOOK_SIGNING_KEY`, and register `delivered` and `opened`
   webhooks pointing at `https://<your-api-host>/webhooks/mailgun`. Locally,
   use `ngrok http 4000` and point Mailgun at the ngrok URL to test webhooks
   before you deploy.

## Environment variables

See `.env.example` for the full annotated list. The short version:

| Var | Used by | What it's for |
|---|---|---|
| `DATABASE_URL` | api | Postgres connection string |
| `REDIS_URL` | api, worker | BullMQ's backing store |
| `JWT_SECRET` | api | signs auth tokens |
| `CORS_ORIGIN` | api | which frontend origin(s) may call the API |
| `MAILGUN_*` | api, worker | sending mail + verifying inbound webhooks |
| `PUBLIC_API_URL` | api | not currently required, kept for reference if you add click-tracking redirects later |
| `NEXT_PUBLIC_API_URL` | web | where the frontend sends its requests |

## How the pieces fit together

**Account isolation.** Every tenant-owned table (`contacts`, `audiences`,
`campaigns`, `campaign_recipients`) carries a `workspace_id`. There's no
Postgres row-level security — the guarantee is enforced in the app layer:
`requireAuth` decodes the JWT and puts `workspace_id` on `req`, and *every*
query in `routes/*.js` filters or joins on `req.workspaceId`, taken only from
the verified token, never from the request body or URL params. I tested this
by creating two workspaces and confirming account B's token can't read,
update, or delete account A's contacts/audiences/campaigns (404, not a
silent empty result, so it doesn't leak existence either).

**Contact dedup.** A contact is a duplicate if it shares an email *or* phone
with one already in the workspace (checked in `services/dedupe.js`, backed
by partial unique indexes in the migration as a hard backstop). I chose
**skip over merge** — new/imported duplicates are dropped, not created, and
the import endpoint reports counts (`"15 added, 3 skipped as duplicates"`)
instead of silently discarding anything. The manual "add contact" endpoint
runs the exact same check and returns a 409 with the existing contact so the
UI can say "this person's already in here." The bundled `mock-data` style
CSV (Meera Nair / Sneha Iyer share an email+phone, Dev Malhotra / Priya
Patel too) is a good test case for this.

**Custom fields.** Contacts have fixed `name`/`email`/`phone` columns plus a
`custom_fields jsonb` column for anything else. CSV columns outside the
fixed three land in there automatically; `tags` is special-cased into a JSON
array so tag-based audience filters work without extra setup.

**Audiences.** A saved filter (`{ "tag": "vip" }` or
`{ "field": "city", "value": "Mumbai" }`) resolved to SQL in
`services/audienceFilter.js`, reused both for the audiences list's live
member counts and for resolving campaign recipients — one code path, so the
"members" count you see when picking an audience is exactly who gets
emailed.

**Campaign recipients — two entry paths.** Picking an audience/tag resolves
against contacts at campaign-creation time and freezes the list into
`campaign_recipients` (so the list a user reviewed doesn't quietly shift if
they edit a contact afterwards). Pasting a block of emails/phones runs each
line against saved contacts, attaches the matched name for the sanity-check
UI, and flags anything unmatched rather than dropping it — those flagged
rows are excluded from sending, not silently emailed with no context.

**Scheduling.** `POST /campaigns/:id/schedule` computes a delay and adds a
delayed BullMQ job (`queue/campaignQueue.js`) with the campaign id as the
job id, keyed to Redis. This is deliberately not a `setTimeout` or a
polling loop over the table: the job lives in Redis (with AOF persistence
turned on in `docker-compose.yml`), so if the API or the worker process
restarts, the delayed job is still there when the worker comes back up and
fires at the right time — nothing needs to be re-derived from wall-clock
math on restart. "Send now" goes through the exact same queue with a delay
of 0, so there's one send code path (`services/sendCampaign.js`), not two.

**Analytics.** Mailgun webhooks (`routes/webhooks.js`, signature-verified)
update `campaign_recipients.status` by matching Mailgun's message id back to
the row `sendCampaign.js` stored when it sent. The campaign detail page
polls `GET /campaigns/:id/analytics` every 4 seconds, which just counts
`campaign_recipients` grouped by status — no separate aggregate table to
keep in sync, the count is always derived fresh from source of truth.

## Trade-offs / what I'd do differently with more time

- **No automated tests.** For a project this size I'd normally add a handful
  of integration tests around the isolation boundary and the dedup logic
  specifically, since those are the two things silent bugs would hurt most.
  I verified both by hand instead.
- **Plain JS, not TypeScript**, on the API to keep the take-home's surface
  area smaller to review. I'd reach for TS on a real team project.
- **No rate limiting / no email verification flow** on signup — out of scope
  for a 3-day take-home but not something I'd skip on a real product.
- **CSV import buffers the whole file** in memory via multer; fine at
  contact-list sizes here, but a truly large import would want streaming
  parse + chunked inserts.
- **Extra credit:** campaign duplication is implemented
  (`POST /campaigns/:id/duplicate`). PDF/file attachments on outgoing email
  are **not** implemented — I prioritized getting the required scheduling +
  webhook + isolation pieces solid over the stretch goals.
- **Open-tracking is Mailgun's own pixel**, so per the brief's own caveat,
  it undercounts opens on clients that block tracking pixels; the UI notes
  this rather than presenting it as exact.

## Deploying

- **Web**: Vercel, root directory `apps/web`, env var `NEXT_PUBLIC_API_URL`
  pointing at the deployed API.
- **API + worker**: Railway or Render, two services from `apps/api` — one
  running `npm start` (the HTTP server), one running `npm run worker:start`
  (the BullMQ consumer) — plus a managed Postgres and Redis add-on. Run
  `npm run migrate` once against the production `DATABASE_URL` before first
  boot. Make sure the Redis add-on has persistence enabled, since that's
  what makes scheduled sends survive a restart.
