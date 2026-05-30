# Bounce Display

DVD-style bouncing logo with a centered countdown timer. Client-side React app — settings sync via `localStorage` and `BroadcastChannel` (same browser).

## Routes

| Path | Purpose |
|------|---------|
| `/` | Fullscreen display (put on the projector) |
| `/admin` | Control panel |

## Development

```bash
npm install
npm run dev
```

- Display: http://localhost:5173/
- Admin: http://localhost:5173/admin

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in [Vercel](https://vercel.com).
3. Framework preset: **Vite** (defaults are fine).
4. Deploy.

`vercel.json` rewrites all routes to `index.html` for client-side routing.

Or CLI:

```bash
npm install -g vercel
vercel
```

## Default logo

`public/SYM_Logo.png` is used until you upload a custom image in admin.

## Two-screen setup

1. Open `/` fullscreen on the presentation display.
2. Open `/admin` on your laptop.
3. Same browser profile on the same machine keeps settings in sync. For separate devices, both tabs must share origin (your Vercel URL) — timer/control sync still uses `localStorage` per device unless you add a backend later.
