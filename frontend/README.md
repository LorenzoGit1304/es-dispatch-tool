# Frontend (React + Vite + Clerk)

## Requirements

- Node.js `>=20.19.0`
- Backend running on `http://localhost:4000`

## Setup

1. Copy env file:

```bash
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

## Current behavior

- Uses Clerk for sign-in and token handling.
- Calls `POST /users/sync` after login.
- Loads dashboard data based on synced role:
  - `ADMIN`: `/users`, `/enrollments`, `/offers`, `/audit-log`
  - `ES`: `/offers/my`
  - `AS`: `/enrollments/my/requests`
