# Task: Diagnose the deployment error from the screenshot

## Working directory
`/home/zeleniuk/git_parser/`

## What happened
I pushed a commit (`987a3e9`) to the telegram-parser repo (GitHub `zelenykvd/git_parser`), updated the Coolify build command to include `npx prisma migrate deploy`, and triggered a deploy via Coolify API. The deploy appears to have FAILED. The user sent a screenshot of the error.

## What to do
1. **Look at the screenshot** `deploy_error.png` (in this dir) — read the error shown in it (it likely shows what the deploy/container error is).
2. Correlate with the deploy setup (from Coolify API):
   - build_pack=nixpacks
   - build_command=`npm install && npx prisma migrate deploy && npm run build && cd admin && npm install && npm run build && cd ..`
   - start_command=`npx prisma migrate deploy && npm run start`
   - ports_exposes=3001, ports_mappings=3001:3001
   - fqdn=http://bdcp8kraf9s12uinqyh96fd7.176.110.103.57.sslip.io
   - status was `running:unknown`
3. **Inspect the live deploy/logs** to find the REAL error: use docker (`docker logs <bdcp8kraf container>`, `docker ps -a` for exit status, `docker inspect` for restart counts), and check the app's database/migration state (`prisma`/postgres container `fdvwewhhpywzy5yjvrqx7r96`).
4. Identify the root cause (e.g. migration failing, npm build error, port/health-check issue, missing env, nixpacks issue, or the `start_command` double-running migrate).
5. Fix it in the repo/CLAUDE if it's a code/config problem (but do NOT push/deploy unless I say). If it's a Coolify config issue, document the exact fix (and I may apply via API).
6. Write findings to `DEPLOY_DIAGNOSIS.md`: the error from the screenshot, the real root cause, and the exact fix steps.

## Constraints
- Read-only on the running system except for fixes to local repo files. Do NOT re-deploy or restart Coolify apps unless I approve.
- Do not print secrets (tokens/DB passwords) into the report.
- The screenshot may be low-res/Ukrainian/obfuscated — use it as a HINT, but rely on the real docker logs for the actual error.

## Report back (short)
- What error the screenshot shows (or "unreadable").
- The actual root cause from docker logs.
- The exact fix + whether it's repo-side or Coolify-config-side.