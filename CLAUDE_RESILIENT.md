# Task: Make Telegram Parser translation resilient — auto-select a WORKING VoidAI model

## Working directory (the parser source)
`/home/zeleniuk/git_parser/`

## Goal (the real objective)
The user wants **translation to be uninterrupted**: instead of a single hardcoded `LLM_MODEL` that can be dead, the parser should **itself find and use a working VoidAI model**. Implement model resilience inside the parser code (`src/translator/llm.ts`) so that on startup AND at runtime, if a model fails, it probes alternatives and falls back to a working one. This must be built into the app, not an external script.

## Context / already established
- Parser backend: TypeScript. Translation logic in `src/translator/llm.ts` (provider chain: VoidAI primary -> "VoidAI-beta" (optional 2nd host) -> OpenRouter fallback). Config in `src/config.ts` (reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_BASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`). Env provded via Coolify + bind-mounted `/app/.env`.
- We already live-probed VoidAI with the user's key: most Western providers are DOWN (openai 500, anthropic 503, google/perplexity 500). Currently WORKING chat models on VoidAI include:
  `umbra`, `deepseek-v4-pro`, `deepseek-v4-flash-0731`, `glm-5.2`, `deepseek-v3.2`, `kimi-k2.7-code`, `qwen3-coder-480b-a35b-instruct`, `qwen3-235b-a22b-instruct`, `kimi-k3`, `kimi-k2.6`, `deepseek-v4-flash`.
- **Methodological gotcha:** reasoning models (deepseek-pro, glm-5.2, kimi, qwen) return an EMPTY `content` when max_tokens is small (<~300). A health check that requires non-empty content will wrongly mark working models as broken. Handle with max_tokens>=300 OR by checking for a valid response / `finish_reason` / no `error`, not just non-empty content.
- Current `LLM_MODEL=gpt-5.1` (dead). Parser uses `/v1/chat/completions` on `LLM_BASE_URL` (default https://api.voidai.app/v1).

## What to build (inside the parser, in `src/translator/llm.ts`)
1. **Working-model discovery / cache**:
   - A `getWorkingVoidAIModels()` that, on startup (and refreshable), fetches `GET /{base}/models`, optionally probes them cheaply, and maintains an ordered list of KNOWN-GOOD VoidAI models for translation. Start the candidate list from the known-good set above (source of truth), optionally verify live.
   - **CRITICAL — TEXT/CHAT MODELS ONLY.** The VoidAI catalogue has ~80 models total, of which ~64 are chat/text-capable; the rest are non-text classes that MUST be EXCLUDED from translation candidacy because they use different endpoints and cannot translate text: image generators (gpt-image-1/1.5/2, flux-kontext-*, midjourney, recraft-v3), speech/TTS (tts-1, tts-1-hd, gpt-4o-mini-tts), transcription (whisper-1, gpt-4o-mini-transcribe, gpt-4o-transcribe), embeddings (text-embedding-3-small/large), and moderation (omni-moderation-latest). Filter to the ~64 chat/text models only (use `endpoints`/type metadata in `/v1/models` if present, or an explicit denylist of these classes).
   - Cache the working list in memory (and optionally a file `working_models.json` next to the app) with a TTL so we don't re-probe every request.
2. **Resilient selection + fallback in the call path**:
   - When translating, use the current preferred VoidAI model (from `LLM_MODEL` if it works, else first healthy from the working list).
   - If a request to VoidAI fails (5xx/network/timeout — NOT auth), try the NEXT candidate model on VoidAI before giving up to OpenRouter. Rotate through candidates.
   - Account faults (401/402/429/insufficient credits) should NOT be treated as "model down" — those mean the key is the issue; skip straight to OpenRouter fallback and/or log clearly.
   - Preserve the existing OpenRouter fallback as the final safety net.
3. **Keep the `translationModel` column working** — when a fallback/model wins, record which model actually produced the translation (we already store this; make sure resilient selection populates it correctly, e.g. `voidai/<model>` or `openrouter/<slug>`).
4. Make it configurable: an env flag like `LLM_AUTO_SELECT_WORKING=true` (default on) to enable/disable, and optionally `LLM_WORKING_MODELS_CSV` to override the candidate list.
5. **Build check**: `npm run build` (tsc) must pass. Do NOT deploy/redeploy — leave changes in working tree.

## Constraints
- Mutate the parser source only (this repo). Do NOT create a separate external script as the deliverable — the deliverable IS the in-app resilience.
- Preserve existing behavior (manual approval, publishing, OpenRouter fallback, translationModel). Do not print secrets.
- Read `src/translator/llm.ts`, `src/config.ts`, `.env.example` first to match style/structure.
- Do not commit/push; leave changes uncommitted and report.

## Report back (short)
- How the in-app working-model selection + fallback now works (file/line refs).
- What env vars to add (names + default) and whether `LLM_MODEL` should be left as-is or cleared.
- Build status.
- Exact redeploy note for Coolify.