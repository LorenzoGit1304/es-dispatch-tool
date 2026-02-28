# Auth Smoke Tests

Run from `backend/`:

```bash
BASE_URL=http://localhost:4000 \
ADMIN_TOKEN=... \
ES_TOKEN=... \
AS_TOKEN=... \
npm run smoke:auth
```

Expected checks:

- `401` for unauthenticated access (`/users/me`)
- `200` for valid admin routes (`/users`, `/audit-log`)
- `403` for forbidden role access (`ES -> /users`, `AS -> /offers/my`)
- `200` for allowed role access (`ES -> /offers/my`, `AS -> /enrollments/my/requests`)
