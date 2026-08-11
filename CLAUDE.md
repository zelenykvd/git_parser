# Task: Show which model translated each post in the admin panel

## Working directory (the source repo)
`/home/zeleniuk/git_parser`  <- this is the "telegram-parser" app, deployed via Coolify on this machine as "Telegram Parser" (app id=2). GitHub remote: github.com/zelenykvd/git_parser

## Goal
The parser translates Telegram posts to Ukrainian via an LLM (VoidAI primary, VoidAI-beta, then OpenRouter as fallbacks). The user wants the **admin panel to display, for each post, which model/provider did the translation**. The build command (from Coolify) is: `npm install && npm run build && cd admin && npm install && npm run build && cd ..` — so backend is at repo root, frontend admin in `admin/`.

## Context / prior findings (verified)
- Repo layout: `src/` (backend TypeScript: index.ts, server/routes.ts, setup/routes.ts, translator/llm.ts, db/repository.ts, bot/*, parser/*), `prisma/` (schema), `admin/` (React admin panel), `.env.example`, `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `readme.md`.
- Translation happens in `src/translator/llm.ts` with provider fallback chain (VoidAI -> VoidAI-beta -> OpenRouter). Posts go through manual approval before publishing to VaibeCod / Telegram `@uallm` / LinkedIn.
- DB is Postgres via Prisma (container `fdvwewhhpywzy5yjvrqx7r96`).

## What to build
1. **Persist the model** used per translation. Approach: add a column to the relevant Prisma model (likely the Post/translation table) storing which model/provider produced the translation, e.g. `translationModel` / `translationProvider`. Look at `prisma/schema.prisma` first to find the right model. Populate it in `src/translator/llm.ts` where the successful call happens (capture the exact model id used, e.g. from the API response, including which fallback tier won).
2. **Expose it via the API**: add the field to the corresponding server route / DTO so the admin gets it.
3. **Show in admin panel**: in `admin/`, add the field to the post/translation list and/or detail view (e.g. a "Model" column/badge showing e.g. `voidai/gpt-5.1` or `openrouter/deepseek-v4-flash`).
4. **Migration**: if the Prisma schema changes, add the proper Prisma migration (`npx prisma migrate dev` with a descriptive name, or generate the migration SQL) so it applies cleanly on deploy. Do NOT drop data.
5. Keep it **redaction-safe**: do not print API keys/secrets; don't touch `.env`.
6. After implementing, run a build check (`npm run build` and admin build) to make sure it compiles. Do NOT deploy/redeploy to Coolify unless the user asks — just implement in the repo and report exact steps to rebuild/redeploy.

## Constraints
- This is the user's own production code — make minimal, careful changes; preserve existing behavior (fallback chain, manual approval, publishing) exactly.
- Respect existing code style (TypeScript, Prisma, React).
- Do not leak secrets anywhere. Do not commit/push unless asked — leave changes in the working tree and report what you did.
- If the exact table/model for translations isn't obvious, read `prisma/schema.prisma` and `src/db/repository.ts` to trace where a translation result is stored, then decide.

## Report back (short)
- Where you added the model field (schema + file/line), and where it's captured in llm.ts.
- How the admin panel now shows it (file + component).
- Build status (passed/failed).
- Exact commands/notes to rebuild + redeploy in Coolify later.