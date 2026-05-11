# TsutsikGame deployment checklist

## Frontend environment

Create this variable on Vercel:

```text
VITE_API_BASE_URL=https://YOUR-BACKEND-URL.railway.app
```

## Backend environment

Create these variables on Railway backend service:

```text
DATABASE_URL=Railway PostgreSQL connection URL
FRONTEND_ORIGIN=https://YOUR-FRONTEND-URL.vercel.app
ADMIN_TEST_ENABLED=false
```

Use `ADMIN_TEST_ENABLED=true` only locally or on a temporary private test deployment.

## Recommended deploy order

1. Push project to GitHub.
2. Create Railway PostgreSQL database.
3. Deploy backend from the `backend` folder.
4. Copy Railway backend URL.
5. Deploy frontend to Vercel.
6. Put backend URL into Vercel `VITE_API_BASE_URL`.
7. Put frontend URL into Railway `FRONTEND_ORIGIN`.
8. Open `/health` on backend and check `database: connected`.
9. Set Telegram Mini App URL in BotFather to the frontend URL.

## Useful checks

Backend health:

```text
https://YOUR-BACKEND-URL.railway.app/health
```

Game state:

```text
https://YOUR-BACKEND-URL.railway.app/api/game/state
```
