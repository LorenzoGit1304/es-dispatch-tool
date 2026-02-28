# es-dispatch-tool
Dispatch workflow for handling enrollment transfer requests and routing them to Energy Specialists (ES) with fair assignment and offer lifecycle handling.

## Current architecture

- **Backend**: Node.js + Express + TypeScript + PostgreSQL.
- **Frontend**: React + Vite + TypeScript web UI for dispatch team operations.

## Current stage

Project status is updated to **completed through Phase 5**, with **Phase 6 (frontend)** in progress.

Completed so far:
- Core dispatch, fallback assignment, offer lifecycle, timeout job, user CRUD.
- DB hardening and indexing migrations, plus migration tooling (`node-pg-migrate`).
- Health route correctly mounted.
- Clerk auth integrated (`clerkMiddleware`, protected route mounts, auth middleware flow).
- Clerk identity linking implemented (`users.clerk_id`, `email`, `/users/sync`, `requireRole` middleware).
- Validation + standardized API error contracts implemented.
- Missing detail endpoints, pagination, and enrollment status filtering implemented.
- Audit log migration and write-tracking integrated into mutating routes.
- Frontend scaffold created (React + Vite + Clerk + protected routing + initial dashboard + `/users/sync` bootstrap).

Active focus now:
- **Phase 6: role-based frontend implementation**.


## Backend setup

1. Create database and apply SQL files in order:
   - Prefer migration tooling:
   - `cd backend && npm run migrate:up`
2. Add `backend/.env`:

```env
DB_USER=dispatch_user
DB_HOST=localhost
DB_NAME=es_dispatch
DB_PASSWORD=yourpassword
DB_PORT=5432
PORT=4000
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
FRONTEND_URL=http://localhost:5173
```

3. Start backend:

```bash
cd backend
npm install
npm run dev
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend expects backend at `http://localhost:4000`.

Frontend `.env` (required):

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_BASE_URL=http://localhost:4000
```

## Frontend role plan (Phase 6)

1. `ADMIN` panel:
   - user/status management
   - maintenance view
   - audit/log access
2. `ES` account:
   - language selection (`English`, `Spanish`, `Both`)
   - landing page with status and assigned/pending work
   - status update controls and offer actions
3. `AS` account:
   - transfer request flow (premise ID + timeslot)
   - transfer tracking (requested, accepted, by whom)
   - transfer completion action when accepted

## Next milestones

1. Phase 6: implement role-based frontend pages (`ADMIN`, `ES`, `AS`) and navigation.
2. Phase 6: add backend ownership/role guard enhancements required by UI flows.
3. Phase 7: add automated tests (auth/role, dispatch flows, race conditions).
4. Phase 8: production deployment hardening (Railway pipeline, monitoring, runbooks).
