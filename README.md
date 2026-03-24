# es-dispatch-tool

Dispatch workflow for handling enrollment transfer requests and routing them to Energy Specialists (ES) with fair assignment, language-aware offer handling, and admin recovery tooling.

## Stack

- Backend: Node.js + Express + TypeScript + PostgreSQL
- Frontend: React + Vite + TypeScript
- Auth: Clerk

## Current Stage

The project is now in the final stretch before deployment.

Implemented so far:
- Clerk authentication and role-aware dashboard loading
- `ADMIN`, `ES`, and `AS` views and actions
- Enrollment request creation, offer accept/reject, reassignment, completion, and timeout handling
- Language-aware dispatch rules for `English`, `Spanish`, and `Both`
- Admin queue monitoring, audit logging, recovery tools, and re-offer controls
- Standardized validation, API error handling, request logging, request IDs, and rate limiting
- Migration-based schema management with `node-pg-migrate`

Current focus:
- regression testing across all dispatch and language flows
- deployment preparation
- post-deploy smoke-test checklist

## Local Setup

### Backend

1. Copy env file:

```bash
cd backend
cp .env.example .env
```

2. Fill values:

```env
DB_USER=dispatch_user
DB_HOST=localhost
DB_NAME=es_dispatch
DB_PASSWORD=yourpassword
DB_PORT=5432
PORT=4000
CLERK_SECRET_KEY=sk_test_your_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

3. Use Node 20.19+:

```bash
nvm use
```

4. Install, migrate, and run:

```bash
npm install
npm run migrate:up
npm run dev
```

### Frontend

1. Copy env file:

```bash
cd frontend
cp .env.example .env
```

2. Fill values:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_BASE_URL=http://localhost:4000
```

3. Install and run:

```bash
npm install
npm run dev
```

## Verification Commands

From `backend/`:

```bash
npm run migrate:status
npm run typecheck
npm run build
```

Auth and role smoke checks:

```bash
BASE_URL=http://localhost:4000 \
ADMIN_TOKEN=... \
ES_TOKEN=... \
AS_TOKEN=... \
npm run smoke:auth
```

From `frontend/`:

```bash
npm run build
```

## Manual Regression Priorities

Run these before deployment:

1. `English` request: create -> offer -> accept or reject -> reassign -> complete
2. `Spanish` request: create -> offer -> accept or reject -> reassign -> complete
3. `Both` request: verify it can route to compatible `English`, `Spanish`, or `Both` ES users
4. Admin re-offer: confirm language compatibility is enforced
5. ES notification flow: sound, browser notification, top-of-queue visibility
6. Session and auth flow: sign-in, `/users/sync`, role-aware dashboard loading

## Production Deployment Checklist

### Required backend env vars

```env
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
PORT=
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
```

### Required frontend env vars

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_pk_test
VITE_API_BASE_URL=https://your-backend-domain.com
```

### Deployment order

1. Provision production PostgreSQL database
2. Set backend env vars
3. Run backend migrations
4. Deploy backend and verify `GET /health`
5. Set frontend env vars
6. Deploy frontend
7. Verify Clerk sign-in and `/users/sync`
8. Run one full manual dispatch smoke test in production

## Railway Setup Checklist

This project is ready to deploy on Railway, but the backend currently expects discrete `DB_*` environment variables, not just a single `DATABASE_URL`.

### Railway backend service

1. Create a new Railway project.
2. Add a PostgreSQL service.
3. Add a backend service from this repo.
4. Set the backend root directory to `backend`.
5. Use these commands:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
6. Set backend environment variables:
   - `DB_HOST` = Railway Postgres host
   - `DB_PORT` = Railway Postgres port
   - `DB_USER` = Railway Postgres user
   - `DB_PASSWORD` = Railway Postgres password
   - `DB_NAME` = Railway Postgres database name
   - `PORT` = Railway provided port or `4000`
   - `CLERK_SECRET_KEY` = your production Clerk secret key
   - `CLERK_PUBLISHABLE_KEY` = your production Clerk publishable key
   - `FRONTEND_URL` = deployed frontend URL
   - `NODE_ENV` = `production`
7. Run migrations against the Railway database before first production use.
8. Verify `GET /health` on the deployed backend URL.

### Mapping Railway Postgres vars to this backend

Railway usually exposes Postgres credentials with names like `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`.
Map them into this app's env vars like this:

```env
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}
```

If you do not create those `DB_*` variables in Railway, the backend and migrations will fail to start.

### Railway frontend service

1. Add a second service from this repo.
2. Set the frontend root directory to `frontend`.
3. Use these commands:
   - Build command: `npm install && npm run build`
   - Start command: serve the `dist/` output using your chosen static hosting method
4. Set frontend environment variables:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `VITE_API_BASE_URL`
5. In Clerk, add the deployed frontend URL to the allowed origins and redirect URLs.
6. Update backend `FRONTEND_URL` so CORS matches the deployed frontend.

### Railway pre-launch checks

1. Backend deploy succeeds and `GET /health` returns success
2. Frontend loads and Clerk sign-in works on deployed domain
3. `POST /users/sync` succeeds after login
4. One AS request can be created and seen by a compatible ES
5. Offer accept, reject, and completion all work in production
6. Admin dashboard loads queue, users, and audit log without CORS or auth issues

## Recommended Post-Deploy Smoke Test

1. Open frontend and sign in as `ADMIN`
2. Confirm dashboard loads and `/users/sync` succeeds
3. Sign in as `AS` in a separate session and create one enrollment request
4. Sign in as `ES` in another session and accept it
5. Mark the enrollment as current and complete it
6. Confirm Admin audit visibility and queue updates
7. Confirm backend `health` route stays green

## Next Milestones

1. Finish the manual regression pass and close any remaining dispatch bugs
2. Prepare Railway for backend and frontend deployment
3. Execute deployment and run the smoke checklist
4. Add automated tests for dispatch rules, auth, and critical frontend flows
