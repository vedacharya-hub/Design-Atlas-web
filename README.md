# WeWork Workplace — Book Office Desk

Implementation of the desk-booking flow from the
[Figma prototype](https://www.figma.com/design/jjJofZQUMUEWmcEmemYHmk/Workplace?node-id=1124-65427).

- **client/** — React + Vite + TypeScript. Design tokens in `src/theme.css`, from-scratch
  UI primitives in `src/components/ui`, the flow in `src/features/booking`.
- **server/** — Node + Express + TypeScript with an in-memory data store
  (`src/data/seed.ts`). Serves the floor-plan image from `server/public/floorplan.png`.

## Run

```bash
# one-time
npm run install:all        # installs client + server deps

# dev (two terminals, or use the root script)
npm --prefix server run dev   # http://localhost:4000
npm --prefix client run dev   # http://localhost:5173 (proxies /api → 4000)

# or both together
npm install                # installs `concurrently` at the root
npm run dev
```

## Flow

- **MySelf** — pick a date (with optional **Recurring** toggle) → *Choose desk* →
  select **random** or a **specific** seat on the map → *Confirm*.
- **Others** — you're pre-selected; search and add members, assign each a seat on the map.
- **Recurring** and **Others** are mutually exclusive (recurring = single person).

Seat coordinates are pulled from the Figma frame and stored as percentages so markers
overlay the floor image exactly. Bookings persist in memory and flip seats to
*unavailable*; restart the server to reset.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/filters` | building / floor / office / shift options |
| GET | `/api/floors/:id/seats?zone=` | seats with status + coordinates |
| GET | `/api/members?query=` | searchable member directory |
| POST | `/api/bookings` | create booking (validates availability) |
| GET | `/api/bookings` | list bookings |

## Notes / next steps

- Fonts *Apercu Pro* / *WeWork Serif* are proprietary — drop the woff2 files into
  `client/public/fonts` and add `@font-face` (fallbacks are wired in `theme.css`).
- The in-memory store is behind a simple module boundary; swap `server/src/data`
  for a real DB + auth without touching the API surface.
- **Shared Desk** tab and the non-active nav tabs are static placeholders in this phase.
