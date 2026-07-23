# MailKit - Email Marketing Platform

MailKit is a lightweight email marketing platform inspired by tools like Mailchimp. It allows users to manage contacts, create audiences, send email campaigns, schedule campaigns, and track email performance through real-time analytics.

The project follows a monorepo architecture with a separate frontend and backend application.

---

# Features

## Authentication

- User signup and login
- JWT based authentication
- Protected API routes
- Workspace-level data isolation

---

# Contacts Management

Users can manage contacts with:

- Create contacts
- Update contacts
- Delete contacts
- Import contacts using CSV files
- Duplicate detection

Duplicate detection is performed using:

- Email address
- Phone number

Import results provide:

- Successfully added contacts
- Skipped duplicate contacts

---

# Audience Management

Users can create and manage audiences.

Features:

- Create saved audiences
- Filter contacts dynamically
- Audience member count
- Tag-based filtering
- Contact attribute filtering

---

# Campaign Management

Users can create email campaigns with:

- Campaign name
- Subject line
- HTML email content

Recipient selection options:

- Existing audience
- Contact tags
- Manual recipient list

Before sending campaigns, users can preview recipients:

- Matched contacts
- Unmatched recipients

---

# Campaign Scheduling

Scheduled campaigns are handled using a background job queue.

Technologies used:

- Redis
- BullMQ

Features:

- Delayed campaign execution
- Background worker processing
- Jobs survive server restarts

---

# Email Sending & Tracking

MailKit uses Mailgun for email delivery.

Supported email events:

- Sent
- Delivered
- Opened
- Failed

Mailgun webhooks update campaign analytics automatically.

Analytics include:

- Total recipients
- Sent emails
- Delivered emails
- Opened emails
- Failed emails

Note:

Email open tracking depends on tracking pixels supported by email clients, so open counts may not represent every email open.

---

# Tech Stack

## Frontend

- Next.js
- React
- JavaScript
- CSS

## Backend

- Node.js
- Express.js

## Database

- PostgreSQL

## Queue System

- Redis
- BullMQ

## Email Provider

- Mailgun

## Deployment

- Frontend: Vercel
- Backend: Render
- Database: Neon PostgreSQL
- Redis: Upstash Redis

---

# Project Structure

```
mailkit

├── apps
│
├── api
│   ├── migrations
│   │
│   └── src
│       ├── db
│       ├── middleware
│       ├── queue
│       ├── routes
│       └── services
│
└── web
    ├── app
    │   ├── dashboard
    │   ├── login
    │   └── signup
    │
    └── lib
```

---

# Backend Structure

```
apps/api

src
│
├── db
│   ├── migrate.js
│   ├── pool.js
│   └── seed.js
│
├── middleware
│   └── auth.js
│
├── queue
│   ├── campaignQueue.js
│   ├── connection.js
│   └── worker.js
│
├── routes
│   ├── auth.js
│   ├── contacts.js
│   ├── audiences.js
│   ├── campaigns.js
│   └── webhooks.js
│
└── services
    ├── audienceFilter.js
    ├── dedupe.js
    ├── mailer.js
    ├── resolveRecipients.js
    └── sendCampaign.js
```

---

# Frontend Structure

```
apps/web

app
│
├── dashboard
│   ├── audiences
│   ├── campaigns
│   │   ├── new
│   │   └── [id]
│   │
│   └── contacts
│
├── login
│
└── signup


lib

└── api.js
```

---

# Local Development Setup

## Requirements

Install:

- Node.js
- PostgreSQL
- Redis

---

# Install Dependencies

From the project root:

```bash
npm install
```

---

# Environment Variables

Create environment variables for the backend.

Example:

```
DATABASE_URL=

REDIS_URL=

JWT_SECRET=

PORT=

CORS_ORIGIN=

MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM=

MAILGUN_WEBHOOK_SIGNING_KEY=

PUBLIC_API_URL=

NEXT_PUBLIC_API_URL=
```

---

# Database Setup

Run migrations:

```bash
npm run migrate
```

Optional seed data:

```bash
npm run seed
```

---

# Running The Application

## Start Backend API

```bash
npm run dev:api
```

Backend runs on:

```
http://localhost:4000
```

---

## Start Background Worker

```bash
npm run dev:worker
```

Worker handles:

- Scheduled campaigns
- Queue processing

---

## Start Frontend

```bash
npm run dev:web
```

Frontend runs on:

```
http://localhost:3000
```

---

# API Architecture

The backend exposes:

```
/api/auth
/api/contacts
/api/audiences
/api/campaigns
/webhooks
```

---

# Design Decisions

## Duplicate Handling

Contacts are normalized and checked before insertion.

This prevents duplicate records using:

- Email
- Phone number

---

## Queue Based Scheduling

BullMQ was selected instead of cron jobs because:

- Jobs persist after server restart
- Better retry handling
- Reliable background execution

---

## Webhook Based Analytics

Mailgun webhooks are used instead of checking email status manually.

Benefits:

- Real-time updates
- Less API polling
- Accurate delivery events

---

## Frontend Analytics Refresh

Campaign analytics automatically refresh periodically to provide near real-time updates without requiring manual page refresh.

---

# Deployment Architecture

```
                Users

                  |
                  |

              Vercel
          Next.js Frontend

                  |
                  |

             Render API
          Express Backend

                  |
        --------------------

        PostgreSQL     Redis

          Neon       Upstash


                  |

              Mailgun

          Email Delivery
          Webhooks
```

---

# Production Deployment Steps

## Frontend

Deploy using:

- Vercel

Environment:

```
NEXT_PUBLIC_API_URL=<production-api-url>
```

---

## Backend

Deploy using:

- Render Web Service

Required environment variables:

```
DATABASE_URL
REDIS_URL
JWT_SECRET

MAILGUN_API_KEY
MAILGUN_DOMAIN
MAILGUN_FROM

MAILGUN_WEBHOOK_SIGNING_KEY

PUBLIC_API_URL
CORS_ORIGIN
```

---

## Worker

Deploy as:

- Render Background Worker

Uses the same backend environment variables.

---

# Future Improvements

Possible enhancements:

- Email templates
- Rich text editor
- Campaign attachments
- Advanced audience filters
- Better analytics dashboards
- Retry failed emails
- Multiple email providers
- Role based permissions

---

# Author

Rohan Adhav

GitHub:

https://github.com/Rohan-Adhav
