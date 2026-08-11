# Task: Diagnose & fix translation failure — "401 User not found" (LLM endpoint)

## Working directory
`/home/zeleniuk/git_parser/`

## Context
The telegram-parser app (deployed in Coolify, container `bdcp8kraf9s12uinqyh96fd7-203202220074`, image 987a3e9) starts fine and the Prisma migration applied. BUT translation is failing. User reports **"401 User not found"** and the container logs show:

```
[LLM] Endpoint failed (https://api.voidai.app/v1), trying next... 500 An error occurred. Reference: req_1786480562170...
[LLM] Endpoint failed (https://api.voidai.app/v1), trying next... 500 An error occurred. Reference: req_1786480563699...
```

The LLM call chain is VoidAI (`https://api.voidai.app/v1`) primary -> VoidAI-beta -> OpenRouter fallback (per earlier research in `~/voidai/`). The translation should reach one of them.

## Your job
1. **Read the LLM config** as the running app sees it. Inspect the live container env and mounted `.env`:
   - `docker exec bdcp8kraf9s12uinqyh96fd7-203202220074 sh -lc 'env | grep -iE "LLM|API|VOID|OPENROUTER|BASE"'`
   - `docker exec bdcp8kraf9s12uinqyh96fd7-203202220074 cat /app/.env` (redact secrets in your report — show key NAMES + last 4 chars only)
   - Read `src/translator/llm.ts` in the repo to understand which env vars it expects (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `OPENROUTER_API_KEY`?) and how the 401 would surface.
2. **Determine the real cause of the 401**: is it a wrong/invalid VoidAI key, a missing key (app falls to something that 401s), a wrong base URL, or a model that requires auth the key lacks? Correlate with the VoidAI research (does VoidAI even authenticate with a key? earlier we found `/v1/models` is public; chat may need key). Also check whether OpenRouter fallback is correctly configured as a backstop.
3. **Fix** at the repo/config level: correct the env wiring (e.g. ensure a valid key reaches the right provider, or fix which provider is primary). Use `src/config.ts` / `.env.example` / Coolify envs as the source of truth. Do NOT print real secrets anywhere.
4. If a real key is missing/wrong, say exactly which env var to set and its value format (not the secret itself) — the user will supply it.
5. Write `TRANSLATION_FIX.md` with: root cause, what you changed (if anything), and the exact env/config the user must set.

## Constraints
- Read-only on running container EXCEPT you may create/edit files in this repo or correct config files (e.g. `.env` placeholder / `src/config.ts` / README).
- Do NOT redeploy/restart Coolify apps unless I approve.
- Do NOT print secrets in files or the report.
- This is the user's own app — fix it properly.

## Report back (short)
- Root cause of "401 User not found" / the 500s.
- What's wrong with the LLM key/endpoint config and the exact fix.
- Whether you changed repo files, and what env the user must set (names + format only).