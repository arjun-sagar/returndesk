# ReturnDesk

ReturnDesk is a small returns-management app for an online store. Support staff can create and review return requests, add notes, approve or reject requests, complete approved requests, and remove eligible requests without deleting their records.

**Live app:** https://returndesk-nu.vercel.app
**GitHub repository:** https://github.com/arjun-sagar/returndesk

> **Demo only:** There is no authentication or role-based access. Anyone who can reach the app can view and change requests. Use the sample data only; do not enter real customer information.

## What it does

- Search requests and filter by status or reason; sort and paginate results on the server.
- Generate a reference such as `RD-000042` automatically.
- Validate status changes, approval resolutions and refund amounts.
- Prevent duplicate live requests for the same order and item.
- Allow edits only while a request is `Open` or `In Review`.
- Keep notes append-only and soft-remove eligible requests without deleting their history.
- Enforce important data rules in both the application and PostgreSQL.

## Stack

Next.js App Router, React, JavaScript, Next.js Route Handlers, PostgreSQL (`pg` with parameterized raw SQL), Tailwind CSS and Vitest. Neon is the planned hosted PostgreSQL provider, with Vercel for deployment.

## Run locally

You need Node.js **22.9 or newer**, npm, and PostgreSQL **14 or newer**. The commands below assume macOS and Homebrew.

Install and start PostgreSQL if needed:

```bash
brew install postgresql@17
brew services start postgresql@17
pg_isready
```

If PostgreSQL's tools are not on your PATH, add the appropriate Homebrew path to `~/.zshrc` (Apple Silicon usually uses `/opt/homebrew`; Intel Macs use `/usr/local`).

From the project directory, create a local database and role. Do this once; if they already exist, reuse them.

```bash
psql -d postgres -c "CREATE ROLE returndesk WITH LOGIN PASSWORD 'CHOOSE_A_LOCAL_PASSWORD';"
psql -d postgres -c "CREATE DATABASE returndesk_dev OWNER returndesk;"
```

Install dependencies and create your private environment file:

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and set the local connection string. Use the same password you chose above.

```env
DATABASE_URL=postgresql://returndesk:CHOOSE_A_LOCAL_PASSWORD@localhost:5432/returndesk_dev
TEST_BASE_URL=http://localhost:3000
```

Do not add `sslmode` to a local PostgreSQL URL. Keep `.env.local` private and never commit it.

Create the tables and sample data, then start the app:

```bash
npm run db:setup
npm run dev
```

Open <http://localhost:3000>; it redirects to `/requests`. The seed creates 38 requests: 36 visible requests across the available statuses and reasons, plus two soft-removed records. It also adds sample notes.

## Database commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Applies pending SQL migrations. Safe to rerun. |
| `npm run db:seed` | Adds sample data only if the requests table is empty. |
| `npm run db:setup` | Runs migrations and then seeds the database. |
| `npm run db:reset -- --confirm` | **Destructive:** drops the app's tables and recreates them with sample data. Local development only. |

Check the `Migrating`, `Seeding` or `Target` line printed by a script to make sure it points to the database you intend to use. Never run the reset command against production. API integration tests also create and change data, so run them only against your local database.

To run a database script against a specific database, an inline variable takes precedence over `.env.local`:

```bash
DATABASE_URL='YOUR_POSTGRES_CONNECTION_STRING' npm run db:migrate
```

Check the URL carefully before running it. Run `npm run db:seed` separately if you want demo data and the database is empty.

## Deploy with Neon and Vercel

A database running only on your laptop cannot serve a public Vercel deployment. Use a hosted PostgreSQL database.

1. Create a project in Neon. Copy its **pooled** connection string; the hostname should contain `-pooler`. Use the connection string provided by Neon and keep it private. For this app, use `sslmode=verify-full` in the URL.
2. Create the schema in Neon from your project folder:

   ```bash
   DATABASE_URL='YOUR_NEON_POOLED_CONNECTION_STRING' npm run db:migrate
   ```

   If you want the demo records in the hosted database, run `npm run db:seed` with the same connection string. Seeding does not overwrite a non-empty requests table.
3. Push the project to a public GitHub repository. Make sure `.env.local`, passwords and connection strings are not committed.
4. Import that repository into Vercel and use the standard Next.js project settings.
5. In Vercel, open **Settings → Environment Variables** and add `DATABASE_URL` with the Neon pooled connection string. Set it for Production (and Preview only if you want preview deployments to use a database).
6. Deploy or redeploy after adding the variable. Environment-variable changes apply to new deployments.
7. Open the deployed app, create a test request and note, refresh, and confirm the data remains. You can also run the smoke check below against the deployed URL.

Keep local and production databases separate. Do not run `db:reset` or the API integration tests against production. If you use Preview deployments, decide whether they should use a separate database rather than sharing production data.

## Tests and checks

Run these from the project folder:

```bash
npm test
npm run lint
npm run build
```

For API integration tests, start the app in one terminal and run the tests in another:

```bash
npm run dev
npm run test:api
```

These tests modify data in the database configured for the running app, so use your local database only.

The smoke script checks a running server without intentionally changing data:

```bash
npm run smoke -- http://localhost:3000
npm run smoke -- https://YOUR-VERCEL-DOMAIN
```

Run the checks yourself before submission and report their actual results.

## API overview

All API routes return JSON. Successful responses use `data` (and `meta` for lists); errors include a machine-readable `code` and a message.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` / `POST` | `/api/requests` | List/search requests or create one |
| `GET` / `PATCH` / `DELETE` | `/api/requests/{id}` | View, edit or soft-remove a request |
| `POST` | `/api/requests/{id}/transitions` | Change status |
| `POST` | `/api/requests/{id}/notes` | Add a note |

List queries support `q`, `status`, `reason`, `sort`, `order`, `page` and `pageSize`.

## Main business rules

- Allowed transitions: `Open → In Review`; `In Review → Approved` or `Rejected`; `Approved → Completed`. `Rejected` and `Completed` are final.
- Approval requires a resolution: `Refund`, `Replacement` or `Store Credit`. A refund must have a positive amount; other resolutions must not have a refund amount.
- Only one live request can exist for a normalized order number and item SKU. A new request can be created after the earlier one is rejected or completed.
- Request details become locked after approval, rejection or completion. Notes can still be added to requests that have not been removed.
- Removal is a soft delete and is allowed only for `Open` or `Rejected` requests. Removed records and their notes remain in the database.

## Project layout

```text
app/             Pages and API route handlers
components/      React components
lib/             Validation, business rules and database services
db/migrations/   SQL schema migrations
scripts/         Migration, seed, reset and smoke-test scripts
tests/           Unit and API integration tests
.env.example     Environment-variable template
```

## Limitations

This is an assignment/demo app, not a production-ready support system. It has no authentication, authorization or separate status-history table. Search uses substring matching and may need additional indexing at larger scale. 
