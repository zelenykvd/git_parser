# Task: Professional Telegram-style redesign of the admin panel with motion design

## Working directory
`/home/zeleniuk/git_parser/admin`  (React + Vite + React Router admin panel for the telegram-parser app)

## Goal
The current admin UI looks like a novice/student design. Redesign it into a **polished, professional UI in Telegram's design language, with real motion/animation** (motion design). Match Telegram's aesthetic: clean, modern, smooth micro-interactions, glassy surfaces, Telegram blue (#0088cc / brand), dark + light mode, chat-flavored feel.

## Current stack (already verified)
- React 18/19 + react-dom + react-router-dom, Vite.
- Icons: `lucide-react` + `material-symbols`.
- Styling: plain CSS in `src/index.css` (no Tailwind). Keep it CSS-first or introduce a minimal, consistent approach — do NOT pull in a heavy UI kit that fights the existing components.
- Components in `src/components/`: PostCard, ModelBadge, StatusBadge, Avatar, MediaPreview, MediaGallery, TaskBar, TargetAutocomplete, Icon.
- Pages in `src/pages/`: Login, PostList, PostDetail, Channels, ChannelDetail, Settings, Research.
- Auth in `src/auth.ts`, API client in `src/api.ts`.

## What to deliver
1. **Design system / foundation (`src/index.css`)**: CSS custom properties for a Telegram-style palette — Telegram blue (#0088cc, and the newer gradient accents), neutral surfaces, good text contrast, spacing scale, border radius (rounded, chat-bubble friendly), elevation/shadows, and a proper **dark mode** (CSS `prefers-color-scheme` + optional manual toggle). Typography: system font stack (like Telegram's font-family) sized consistently.
2. **Motion design**: add tasteful, restrained animations everywhere:
   - Page/route transitions (fade + slight slide, ~200-300ms, respecting `prefers-reduced-motion`).
   - PostCard hover lift + ripple on click; list item stagger entrance.
   - StatusBadge / ModelBadge micro-pop on mount.
   - Buttons: hover/tap scale (e.g. 0.96), focus rings.
   - Loading skeletons instead of raw text spinners where it fits.
   - SMOOTH — use CSS `@keyframes` + transitions, or a tiny amount of Framer Motion (`motion`) if already viable and lightweight. Prefer CSS-only where it looks identical; avoid jank (only transform/opacity for perf).
3. **Recolor/restyle the existing pages** to match: Login (centered glass card, brand mark), PostList (clean cards w/ avatars, badges, quality spacing), PostDetail (typographic hierarchy, media nicely framed), Channels, Settings, Research — keep ALL existing functionality and data flow intact.
4. Do NOT regress: keep ModelBadge (just added), StatusBadge, publishing flow, approval buttons, auth working.

## Constraints
- Preserve existing behavior/functionality exactly (this is the user's production admin).
- Match existing component API (props) — restyle inside them, don't rewrite page logic.
- Keep build green: `npm run build` must pass in `admin/`.
- Minimal deps: if you add a library (e.g. framer-motion), keep it small and justify it; CSS-only is preferred for anything that looks as good.
- Respect `prefers-reduced-motion`.
- Do NOT deploy to Coolify; just leave changes in the working tree + report.

## Report back (short)
- What design tokens/palette/motion you introduced (with the key CSS vars).
- Which components/pages you restyled and what motion each got.
- Build status (passed/failed).
- Any dependency added (if any) and why.
- Optional: before/after notes and how to redeploy via Coolify later.