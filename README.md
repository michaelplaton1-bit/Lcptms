# LCPTMS — Deployable Web Application

Target hostname: **traffic.lcptms.com**

This is a deployable Next.js application intended for Vercel.

## Current live public connectors
- NOAA CO-OPS / PORTS
  - Calcasieu Channel LB 36: `lc0101`
  - Cameron Fishing Pier: `lc0201`
  - Calcasieu Pass water level: `8768094`
- National Weather Service
  - KLCH latest observation
- National Hurricane Center
  - Current storms feed

## Pending authenticated connectors
- StormGeo WC-181 / WC-62
- LakeCharlesPilots.com private schedule

The application intentionally keeps authenticated credentials server-side in environment variables. They are never sent to the browser.

## Deploy to Vercel

1. Create/connect a Vercel account.
2. Import this project.
3. Deploy.
4. In Vercel Project → Settings → Domains, add:
   `traffic.lcptms.com`
5. Vercel will provide the exact DNS record required.
6. At the DNS provider for `lcptms.com`, add that record.
7. Once DNS propagates, Vercel provisions HTTPS automatically.

Do not point DNS until you have the exact value shown by your Vercel project.

## Environment variables

Copy `.env.example` to `.env.local` when developing locally.

StormGeo:
- `STORMGEO_APP_KEY`
- `STORMGEO_BASE_URL`

Private schedule (future connector):
- `LCP_SCHEDULE_BASE_URL`
- `LCP_SCHEDULE_USERNAME`
- `LCP_SCHEDULE_PASSWORD`

These must be added as encrypted Vercel environment variables, not committed to the repository.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## API health test
- `/api/health`
- `/api/environment`

## Operational safety
This project is decision-support software. It should not present pilot-discretion guidance as a mandatory navigation instruction. Standards, thresholds, data provenance, timestamps, and manual override provenance should remain auditable.