# Translation failure — "401 User not found"

Diagnosed 2026-08-11 against the running container `bdcp8kraf9s12uinqyh96fd7-203202220074` (image `987a3e9`).

## TL;DR

Two independent faults stacked up:

1. **VoidAI is down** for chat completions — every model returns `500` / `503`. This is
   server-side at VoidAI, **not** a problem with your key.
2. **The OpenRouter API key is invalid/revoked** — it returns `401 User not found.`
   Because OpenRouter is the *last* endpoint in the chain, its error is the one that
   propagated to the UI. That is the "401 User not found" you saw.

So the 500s and the 401 are two different providers failing, and the message you saw
blamed the wrong one. **Translation cannot work until a valid OpenRouter key is set**,
since VoidAI is currently unusable.

## Evidence

### VoidAI (`https://api.voidai.app/v1`) — down across the board

Every model in VoidAI's own `/v1/models` catalogue fails:

| model | status | body |
|---|---|---|
| `gpt-5.1` (your `LLM_MODEL`) | 500 | `An error occurred. Reference: req_...` |
| `gpt-5.4`, `gpt-5.2`, `gpt-4o-mini`, `gpt-4.1-mini`, `gemini-2.5-flash`, `gemma-4-31b-it`, `sonar` | 500 | same generic `request_failed` |
| `gemini-3.6-flash`, `gemini-3.5-flash`, `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5` | 503 | `Upstream provider temporarily unavailable` |
| `gpt-oss-120b` | 404 | `The requested resource was not available upstream` |

`GET /v1/models` still returns `200`, so the host is up — only completions are broken.

**Your `LLM_API_KEY` is valid.** Proof: with the real key, `gemini-3.5-flash` reaches the
upstream and returns `503`; with a deliberately bogus key the same request dies earlier
with a generic `500`. The key passes VoidAI's auth layer. No change needed there.

Note VoidAI returns `500` even with **no** `Authorization` header at all — its error
handling is generic, which is why the logs give you nothing actionable.

### VoidAI "beta" tier — was never a real second tier

- Coolify sets `LLM_FALLBACK_BASE_URL=https://api.voidai.app/v1` — **identical to
  `LLM_BASE_URL`**. The "voidai-beta" endpoint was replaying the exact same request to
  the exact same host with the same key and model, then labelling the result
  `voidai-beta/...` in the DB.
- The code default it was meant to use, `https://beta.voidai.app/v1`, **does not resolve
  at all** (NXDOMAIN). That host is gone.

This is why you saw the same endpoint fail twice in the logs before the chain gave up.

### OpenRouter — invalid key (the actual blocker)

```
GET https://openrouter.ai/api/v1/key   ->  401
{"error":{"message":"User not found.","code":401}}
```

`User not found.` is OpenRouter's response for a key that has been deleted, revoked, or
belongs to a removed account. The key *shape* is right (73 chars, `sk-or-v1-` + 64 hex),
so this is a revoked/dead key rather than a typo.

The configured `OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free` **is a valid slug** —
it is present in OpenRouter's live catalogue. The model is not the problem.

## What the user must set

One env var, in Coolify → "Telegram Parser" → Environment Variables:

| var | format | note |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-` + 64 hex chars | Generate a fresh key at <https://openrouter.ai/keys>. The current value is revoked. |

Nothing else is required. Specifically:

- `LLM_API_KEY` — **leave as is**, it is valid.
- `OPENROUTER_MODEL` — `google/gemma-4-26b-a4b-it:free` is fine. Free-tier models are
  rate-limited; if translation volume is high, consider a paid slug and credits.
- `LLM_FALLBACK_BASE_URL` — can be **deleted** from Coolify. It duplicates
  `LLM_BASE_URL` and is now skipped automatically. Only set it if you get a genuinely
  different VoidAI host.

While VoidAI stays down, every translation will fall through to OpenRouter and will be
recorded in the admin panel as `openrouter/google/gemma-4-26b-a4b-it:free`. That is
expected and correct — it is the fallback doing its job.

## Repo changes made

Three files, no behaviour change to the fallback chain other than the fixes described:

1. **`src/translator/llm.ts`**
   - The second VoidAI endpoint is now only registered when
     `LLM_FALLBACK_BASE_URL` is non-empty **and differs from** `LLM_BASE_URL`. A
     duplicate URL no longer produces a pointless retry mislabelled `voidai-beta`.
   - Failures from every tier are now collected and thrown as one aggregate error
     (`All LLM endpoints failed — voidai (...): ... | openrouter (...): ...`) instead of
     rethrowing only the last endpoint's error. This is precisely what made a total
     VoidAI outage present itself as an OpenRouter 401.

2. **`src/config.ts`**
   - `llm.fallbackBaseUrl` now defaults to `""` instead of the dead
     `https://beta.voidai.app/v1`.

3. **`.env.example`**
   - Documented `LLM_FALLBACK_BASE_URL`, the OpenRouter key format, and where valid
     model slugs come from.

No secrets were read into, or written to, any file. `.env` was not modified.

Backend build: **passes** (`npm run build` → `tsc`, clean).

## Rebuild / redeploy (not performed — awaiting approval)

```bash
# from the repo, once you're happy with the diff
git add -A && git commit -m "fix: skip duplicate VoidAI fallback, aggregate LLM errors"
git push origin main
```

Then in Coolify: set `OPENROUTER_API_KEY` to the new key → **Redeploy** the
"Telegram Parser" app (id=2). Build command is unchanged:
`npm install && npm run build && cd admin && npm install && npm run build && cd ..`

Setting the env var alone requires a restart to take effect; a redeploy also picks up the
code changes above.

### Verifying afterwards

```bash
docker exec <container> sh -lc \
  'curl -s -o /dev/null -w "%{http_code}\n" https://openrouter.ai/api/v1/key \
   -H "Authorization: Bearer $OPENROUTER_API_KEY"'
```

`200` means the key is live. Then approve a post in the admin panel and confirm the
Model badge shows an `openrouter/...` value. When VoidAI recovers, the badge will go back
to `voidai/gpt-5.1` on its own — no config change needed.
