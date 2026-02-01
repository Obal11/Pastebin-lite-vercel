# Pastebin-Lite (Vercel + Node + Postgres)

A small Pastebin-like application where users can create text pastes and share a link to view them.  
Supports optional time-based expiry (TTL) and view-count limits.

Deployed URL: **https://pastebin-lite-vercel-two.vercel.app**

---

## Tech Stack

- Node.js (serverless functions on Vercel)
- Vercel serverless API routes (`/api/*`)
- PostgreSQL (Neon) as persistence layer
- Plain HTML UI served from `public/index.html`

---

## Features

- Create a paste with:
    - required `content` (string)
    - optional `ttl_seconds` (integer ≥ 1)
    - optional `max_views` (integer ≥ 1)
- Get back a shareable URL of the form: `/p/:id`
- Fetch paste data via API (`/api/pastes/:id`)
- Paste becomes unavailable when:
    - TTL has passed, or
    - view limit is exceeded
- Deterministic expiry for tests via `TEST_MODE` + `x-test-now-ms` header

---

## Persistence Layer

**Database:** PostgreSQL on Neon.

**Table schema:**

```sql
CREATE TABLE pastes (
  id          VARCHAR(25) PRIMARY KEY,
  content     TEXT NOT NULL,
  ttl_seconds INTEGER,
  max_views   INTEGER,
  views_used  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
