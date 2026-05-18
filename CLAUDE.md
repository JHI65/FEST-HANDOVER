# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173/FEST-HANDOVER/
npm run build      # production build → dist/
npm run lint       # ESLint
npm run deploy     # build + push dist/ to gh-pages branch (GitHub Pages)
```

No test suite exists in this project.

## Architecture

Single-file React app: all UI logic lives in `src/App.jsx`. `src/supabase.js` just exports the Supabase client.

### Screen flow (`Main` component)
`screen` state controls which top-level component renders:
- `"home"` → `<Home>` — festival list with gear/edit mode
- `"builder"` → `<Builder>` — create a new festival
- `"view"` → `<FestView>` — view/operate a festival

`FestView` has its own internal sub-screens driven by local state, not the top-level `screen`:
1. **List** — default; shows artist cards for the active day
2. **Detail** (`selectedId` set) — full handover info for one artist
3. **Add** (`showAdd` true) — add a new artist to the day
4. **Edit artist** (`editId` set) — edit an existing artist

### Data model
Each festival row in Supabase (`festivals` table):
```
{ id, user_id, name, days, members, notes, checks, slots }
```
- `days` — array of `{ id, label, artists[] }`, artists hold the static handover fields (console, connection, signal, preset, toLx, toMon, comments, extraSlots)
- `notes`, `checks`, `slots` — shared live data (FOH notes, SC/SHOW checkboxes, extra runtime slots). Keys use the pattern `{festId}__{dayId}__{artId}[__suffix]`

### Sync strategy
- **Polling every 3 s** (`setInterval` in `Main`) — merges all festivals' `notes/checks/slots` into unified state objects
- No Supabase Realtime subscription in the client; the SQL file enables the publication but the app uses polling
- `saveFestShared` filters keys by festId before writing, so members only overwrite their own festival's data

### Multi-user / sharing
- Owner: `user_id` column. Members: `members text[]` column
- RLS policies allow both owner and members to SELECT/UPDATE
- `join_festival` is a `SECURITY DEFINER` RPC that lets a user add themselves to `members` without needing existing row access
- Share URL encodes the full festival JSON as base64 in `?fest=`; on load the app calls `joinFestAsMember` instead of importing a copy

### Key conventions
- `uid()` — `Math.random().toString(36).slice(2,9)` used for all local IDs
- All styles are inline, collected in the `S` object at the bottom of the file
- `SEED` constant provides the example festival inserted on first login; the old seed id `"cooltural25"` is deleted on load if found
- `base: '/FEST-HANDOVER/'` in `vite.config.js` — all asset paths are prefixed; keep this in mind for any new static assets
