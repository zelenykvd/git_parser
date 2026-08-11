# Deploy diagnosis — Telegram Parser (Coolify app id=2, uuid `bdcp8kraf9s12uinqyh96fd7`)

Date: 2026-08-11 · Commit deployed: `987a3e9` ("feat: track translation model + Telegram-style admin redesign")

## 1. What the screenshot shows

`deploy_error.png` is the Coolify **Deployments** list on mobile, not an error page. It shows:

- Two **Failed** deployments of commit `987a3e9` (20:18:21 UTC, 02m11s and 20:19:24 UTC, 01m44s)
- Older deployments (2026-07-27) = **Success**
- A toast: *"The latest configuration has not been applied — 1 unapplied configuration change detected. A rebuild is required."*

No error text is visible in the screenshot. The actual cause came from the Coolify build logs.

## 2. Actual root cause

Both failed deployments (queue ids 161 and 162) died in the **build phase** with the same error:

```
#13 [stage-0  9/11] RUN ... npm install && npx prisma migrate deploy && npm run build && cd admin && ...
#13 9.983 Prisma schema loaded from prisma/schema.prisma
#13 9.986 Error: Prisma schema validation - (get-config wasm)
#13 9.986 Error code: P1012
#13 9.986 error: Environment variable not found: DATABASE_URL.
#13 9.986   -->  prisma/schema.prisma:7
ERROR: failed to build: ... exit code: 1
```

**`npx prisma migrate deploy` was added to the Coolify *build command*, but `DATABASE_URL` does not exist at build time.**

Two independent reasons it is missing during the Docker build:

1. **The Coolify env var `DATABASE_URL` is flagged preview-only.** In Coolify's DB, the row for this app has `is_preview = true` and there is **no** production (`is_preview = false`) counterpart — every other key (`LLM_API_KEY`, `JWT_SECRET`, …) has both rows. Consequently `DATABASE_URL` never appears in the generated nixpacks Dockerfile `ARG`/`ENV` list, nor in the running container's `Config.Env` (verified with `docker inspect`).
2. **In production the app gets `DATABASE_URL` from a bind-mounted `.env`, which does not exist during build.** The container mounts
   `/data/coolify/applications/bdcp8kraf9s12uinqyh96fd7/app/.env → /app/.env` (Coolify persistent file mount).
   `.env` is gitignored, so it is not in the git clone / Docker build context. Bind mounts only exist at *run* time, never during `docker build`.

Everything else about the deploy is fine — this is a config regression, not a code problem.

### Verified supporting facts

| Check | Result |
|---|---|
| `npm run build` (backend, tsc) locally on `987a3e9` | passes |
| `cd admin && npm run build` locally | passes |
| Prisma at **runtime** in the live container (`npx prisma migrate status`) | works — *"Environment variables loaded from .env"*, datasource `fdvwewhhpywzy5yjvrqx7r96:5432`, 13 migrations, schema up to date |
| `_prisma_migrations` in Postgres | latest applied = `20260727200000_add_telegram_url`; **`20260811120000_add_translation_model` is NOT applied** (build never got that far) |
| Live container `fdd047edb7da` | still the **old** image (`b1624d79…` = commit `b1624d7`), Up 9 days, `RestartCount: 0` — production was never disrupted, it just never got the new build |
| Deploy 161 vs 162 | identical `P1012 / DATABASE_URL` failure |

So the runtime `start_command` (`npx prisma migrate deploy && npm run start`) is **fine as-is** — the Prisma CLI auto-loads `/app/.env` from the mount, and that was proven live. Only the build-time copy of the command is broken.

## 3. The fix

**Coolify-config-side. No repo change is needed** (the repo builds clean and the migration file is correct).

Remove `npx prisma migrate deploy` from the **build command**, keep it in the **start command**:

- Build command (revert to):
  ```
  npm install && npm run build && cd admin && npm install && npm run build && cd ..
  ```
- Start command (leave unchanged):
  ```
  npx prisma migrate deploy && npm run start
  ```

Then redeploy. On container start, `prisma migrate deploy` will read `/app/.env`, apply `20260811120000_add_translation_model`, and hand off to `npm run start`.

Why this ordering is right regardless of the env var: migrations belong at release/start time, not in an image build. A build-time migration would also run on every rebuild from any builder host and couples image builds to DB availability.

### Applying it via the Coolify API

```bash
curl -X PATCH "$COOLIFY_URL/api/v1/applications/bdcp8kraf9s12uinqyh96fd7" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"build_command":"npm install && npm run build && cd admin && npm install && npm run build && cd .."}'

# then
curl -X GET "$COOLIFY_URL/api/v1/deploy?uuid=bdcp8kraf9s12uinqyh96fd7&force=false" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

(Or in the UI: Application → Configuration → Build → Build Command, then **Deploy**. The "latest configuration has not been applied" toast in the screenshot refers to exactly this pending config change.)

### Optional hardening (not required for this deploy)

- **Add a production `DATABASE_URL` env var in Coolify** (Environment Variables → same value as the one in the mounted `.env`, with *preview* unchecked). Today production depends solely on the bind-mounted `.env` file on the host; if that file is ever lost the app loses its DB URL. Note Docker `-e` values take precedence over `dotenv`, so the value must match.
- Keep `.env` out of git (it already is) — do not solve this by committing `.env`.

## 4. Verification after redeploy

```bash
# build succeeded and new image is live
docker ps --filter name=bdcp8kraf --format '{{.Image}}\t{{.Status}}'   # tag should be 987a3e9e…

# migration applied
docker exec fdvwewhhpywzy5yjvrqx7r96 psql -U postgres -d postgres \
  -c "select migration_name, finished_at from _prisma_migrations order by started_at desc limit 3;"
# expect 20260811120000_add_translation_model

# app up
curl -sI http://bdcp8kraf9s12uinqyh96fd7.176.110.103.57.sslip.io | head -1
```

No secrets are reproduced in this document; env values were inspected only by key name and length.
