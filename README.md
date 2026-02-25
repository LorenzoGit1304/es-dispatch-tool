# es-dispatch-tool
Dispatch workflow for handling enrollment transfer requests and routing them to Energy Specialists (ES) with fair assignment and offer lifecycle handling.

## Current architecture

- **Backend**: Node.js + Express + TypeScript + PostgreSQL.
- **Frontend**: React + Vite + TypeScript web UI for dispatch team operations.

## Current stage

Project status is updated to **completed through Phase 1.4** from `ES_Dispatch_Dev_Plan.docx.pdf`.

Completed so far:
- Core dispatch, fallback assignment, offer lifecycle, timeout job, user CRUD.
- DB hardening and indexing migrations (`001` to `006`).
- Health route correctly mounted.
- Clerk auth integrated (`clerkMiddleware`, protected route mounts, auth middleware flow).
- Clerk identity linking implemented (`users.clerk_id`, `email`, `/users/sync`, `requireRole` middleware scaffolding).

Active focus now:
- **Phase 2: Validation & Error Contracts**.


## Backend setup

1. Create database and apply SQL files in order:
   - `backend/sql/001_create_users.sql`
   - `backend/sql/002_create_enrollments.sql`
   - `backend/sql/003_create_enrollment_offers.sql`
   - `backend/sql/004_create_indexes.sql`
   - `backend/sql/005_seed_data.sql`
   - `backend/sql/006_hardening_updates.sql`
   - `backend/sql/007_add_clerk_fiels.sql`
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

## Next milestones

1. Phase 2: add request validation with Zod + standard error contracts.
2. Phase 3: move to migration tooling (`node-pg-migrate`).
3. Phase 4: fill missing endpoints and add pagination.
4. Phase 5: add audit log for all mutating operations.
5. Phase 6-8: frontend completion, test suite, and Railway production deploy.
