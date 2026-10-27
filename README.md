# ReturnDesk

ReturnDesk is a small returns-management app for an online store. Support staff can create and review return requests, add notes, approve or reject requests, complete approved requests, and remove eligible requests without deleting their records.

**Live app:** https://returndesk-nu.vercel.app  
**GitHub repository:** https://github.com/arjun-sagar/returndesk
**Approx time taken** About 10-12 Hours

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

Next.js App Router, React, JavaScript, Next.js Route Handlers, PostgreSQL (`pg` with parameterized raw SQL), Tailwind CSS and Vitest. Neon is used for hosted PostgreSQL, with Vercel for deployment.

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

`DATABASE_URL` is required for database access. `TEST_BASE_URL` is used by the API integration tests and smoke checks when a base URL is not passed explicitly. `NODE_ENV` is managed by Next.js/npm; you normally do not need to set it yourself. Leave `ALLOW_REMOTE_RESET` unset. Do not add `sslmode` to a local PostgreSQL URL. Keep `.env.local` private and never commit it.

Create the tables and sample data, then start the app:

```bash
npm run db:setup
npm run dev
```

Open <http://localhost:3000>; it redirects to `/requests`.

### Seed data

The seed script creates **38 requests**: **36 visible requests** and **two soft-removed records**. The visible requests cover all five statuses:

| Status | Seeded requests |
|---|---:|
| Open | 8 |
| In Review | 7 |
| Approved | 7 |
| Rejected | 7 |
| Completed | 7 |
| **Total visible** | **36** |

The visible requests cover all five reasons:

| Reason | Seeded requests |
|---|---:|
| Damaged | 8 |
| Size Issue | 8 |
| Changed Mind | 8 |
| Wrong Item | 6 |
| Not As Described | 6 |
| **Total visible** | **36** |

The seed script also creates **37 sample notes across 21 requests**. Seeding only runs when the requests table is empty, so it does not overwrite existing request data. The seed data is fictional and intended for demonstration and testing.

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

The public Vercel deployment needs a hosted PostgreSQL database; a database running only on your laptop cannot serve a public Vercel deployment.

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

## Design decisions and assumptions

- **One Next.js application:** The UI and API use the same App Router project and Route Handlers. This keeps deployment and local setup straightforward for a small assignment.
- **PostgreSQL with parameterized SQL:** Database access uses `pg` and parameterized raw SQL rather than an ORM. Validation is performed in the application, while database constraints and indexes protect important invariants at the data layer.
- **Generated references:** Request references are generated from database identity values so they remain unique without relying on client input.
- **Soft removal and append-only notes:** Eligible requests are marked removed rather than physically deleted, and notes are added rather than edited or replaced, preserving the request record and its notes.
- **Duplicate-request rule:** Order numbers and item SKUs are normalized before checking for another live request. Rejected and completed requests do not block a new request for the same order/item pair.
- **Demo assumptions:** The app uses fictional seed data and INR amounts. It has no authentication or role-based access, so it is suitable for demonstration rather than real customer records.

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

## Limitations and submission checklist

This is an assignment/demo app, not a production-ready support system. It has no authentication, authorization or separate status-history table. Search uses substring matching and may need additional indexing at larger scale. It currently assumes INR and uses fictional sample data.

Before submitting:

- Confirm the live URL above is reachable and that creating a request and note persists after refresh.
- Confirm the hosted database is configured and persistent; do not describe Neon deployment as verified until you have tested it.
- Ensure `.env.example` is committed and contains placeholders only, not real credentials. Do not commit `.env.local`.
- Set the GitHub repository description to include the deployed app URL.
- Replace the time-spent note below with your actual time spent, as requested by the assignment.
- Run the test, lint and build commands above and report their actual results.

**Actual time spent:** `[Replace with your actual hours]`
