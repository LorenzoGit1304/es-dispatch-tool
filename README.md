# es-dispatch-tool
Dispatch workflow for handling enrollment transfer requests and routing them to Energy Specialists (ES) with fair assignment and offer lifecycle handling.

## Current architecture

- **Backend**: Node.js + Express + TypeScript + PostgreSQL.
- **Frontend**: React + Vite + TypeScript web UI for dispatch team operations.

## Backend capabilities (implemented)

- Create enrollment request and dispatch to fairest available ES.
- Fallback assignment to BUSY ES queue when no AVAILABLE ES exists.
- Offer lifecycle endpoints:
  - Accept offer (`POST /offers/:id/accept`)
  - Reject offer (`POST /offers/:id/reject`)
- Automatic timeout job to expire old pending offers and re-dispatch.
- User management endpoints for operational updates.

## Backend setup

1. Create database and apply SQL files in order:
   - `backend/sql/001_create_users.sql`
   - `backend/sql/002_create_enrollments.sql`
   - `backend/sql/003_create_enrollment_offers.sql`
   - `backend/sql/004_create_indexes.sql`
   - `backend/sql/005_seed_data.sql`
   - `backend/sql/006_hardening_updates.sql`
2. Add `backend/.env`:

```env
DB_USER=dispatch_user
DB_HOST=localhost
DB_NAME=es_dispatch
DB_PASSWORD=yourpassword
DB_PORT=5432
PORT=4000
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

## Roadmap to production readiness

1. Add authentication/authorization (role-based access and audit trails).
2. Add comprehensive validation and consistent error contracts.
3. Add automated tests (unit + integration + concurrency cases).
4. Add migrations tooling and CI/CD checks.
5. Add monitoring/alerts for offer timeout and dispatch failures.

