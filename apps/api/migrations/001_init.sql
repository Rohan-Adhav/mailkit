-- MailKit initial schema
-- Every tenant-owned table carries workspace_id and every query in the app
-- is required to filter on it -- see apps/api/src/middleware/auth.js and
-- apps/api/src/db/scoped.js for the enforcement layer.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email columns

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email          citext NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           text,
  email          citext,
  phone          text,
  -- arbitrary user-defined fields, e.g. {"city": "Mumbai", "tags": ["vip","newsletter"]}
  custom_fields  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Partial unique indexes: dedupe is scoped per workspace, and only applies
-- when the field is present (a contact can legitimately have no phone, etc).
CREATE UNIQUE INDEX contacts_workspace_email_uq
  ON contacts (workspace_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX contacts_workspace_phone_uq
  ON contacts (workspace_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX contacts_workspace_idx ON contacts (workspace_id);
CREATE INDEX contacts_custom_fields_gin ON contacts USING gin (custom_fields);

CREATE TABLE audiences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           text NOT NULL,
  -- filter shape: { "tag": "vip" } or { "field": "city", "op": "eq", "value": "Mumbai" }
  filter         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audiences_workspace_idx ON audiences (workspace_id);

CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed');
CREATE TYPE recipient_mode AS ENUM ('audience', 'manual');

CREATE TABLE campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  subject         text NOT NULL,
  body            text NOT NULL,
  recipient_mode  recipient_mode NOT NULL,
  audience_id     uuid REFERENCES audiences(id) ON DELETE SET NULL,
  tag             text,
  status          campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at    timestamptz,
  queue_job_id    text, -- BullMQ job id, so we can cancel/reschedule
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_workspace_idx ON campaigns (workspace_id);

CREATE TYPE recipient_status AS ENUM ('pending', 'sent', 'delivered', 'opened', 'failed');

CREATE TABLE campaign_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email               citext,
  name                text,
  matched             boolean NOT NULL DEFAULT true, -- false = pasted input we couldn't match to a contact
  status              recipient_status NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz
);
CREATE INDEX campaign_recipients_campaign_idx ON campaign_recipients (campaign_id);
CREATE INDEX campaign_recipients_workspace_idx ON campaign_recipients (workspace_id);
CREATE INDEX campaign_recipients_message_id_idx ON campaign_recipients (provider_message_id);
