# TsutsikGame — GitHub deploy preparation

## 1. Files that must NOT be uploaded

Do not commit:

- `node_modules/`
- `backend/node_modules/`
- `dist/`
- `backend/dist/`
- `.env.local`
- `backend/.env`
- any real tokens, passwords, database URLs, or bot tokens

The `.gitignore` in this patch protects these files.

## 2. Local check before pushing

From project root:

```cmd
npm install
npm run build
```

From backend folder:

```cmd
cd backend
npm install
npm run build
```

## 3. GitHub push

From project root:

```cmd
git status
git add .
git commit -m "Prepare deployment"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

If `origin` already exists:

```cmd
git remote set-url origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 4. Railway backend settings

Use the `backend` folder as Railway service root.

Environment variables:

```text
NODE_ENV=production
DATABASE_URL=<Railway PostgreSQL DATABASE_URL>
FRONTEND_ORIGIN=<Vercel frontend URL>
ADMIN_TEST_ENABLED=false
```

Build command:

```text
npm install && npm run build
```

Start command:

```text
npm run prisma:deploy && npm run start
```

## 5. Vercel frontend settings

Project root: repository root.

Environment variables:

```text
VITE_API_BASE_URL=<Railway backend URL>
```

Build command:

```text
npm run build
```

Output folder:

```text
dist
```
