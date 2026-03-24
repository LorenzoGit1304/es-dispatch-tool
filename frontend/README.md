# Frontend (React + Vite + Clerk)

## Requirements

- Node.js `>=20.19.0`
- Backend API running and reachable
- Clerk publishable key for the environment you are using

## Local Setup

1. Copy the env file:

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

## Production Build

```bash
npm run build
```

Optional local preview:

```bash
npm run preview
```

## Current Behavior

- Uses Clerk for sign-in and token handling
- Calls `POST /users/sync` after login
- Loads dashboard data based on synced role:
  - `ADMIN`: `/users`, `/enrollments`, `/offers`, `/audit-log`
  - `ES`: `/offers/my`, `/enrollments/my/assigned`
  - `AS`: `/enrollments/my/requests`
- Plays ES new-offer alerts and can raise browser notifications when permission is granted

## Production Env Checklist

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_pk_test
VITE_API_BASE_URL=https://your-backend-domain.com
```

## Railway Frontend Checklist

If you deploy the frontend on Railway:

1. Create a frontend service from this repo
2. Set the root directory to `frontend`
3. Use build command `npm install && npm run build`
4. Serve the generated `dist/` output using your chosen static-serving setup
5. Set:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `VITE_API_BASE_URL`
6. In Clerk, add the deployed frontend URL to allowed origins and redirect URLs
7. Make sure the backend `FRONTEND_URL` matches this deployed frontend URL

## Frontend Deployment Notes

1. Build the frontend with production env vars present
2. Deploy the generated `dist/` output to your hosting target
3. Confirm the deployed frontend can reach the backend origin in `VITE_API_BASE_URL`
4. Verify Clerk sign-in works from the production domain configured in Clerk
5. Verify browser notifications still work after deployment if you plan to rely on them operationally
