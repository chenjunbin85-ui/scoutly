# Scoutly App

Frontend for Scoutly, a read-only Reddit discovery workspace for SaaS teams.

The app lets users create projects, configure discovery inputs, run scans, review scored Reddit opportunities, update review status, and export reports.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- Base UI primitives
- lucide-react

## Local Development

```bash
npm install
npm run dev
```

The app expects the backend at `http://127.0.0.1:8000/api/v1` by default.

To override:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_API_KEY=dev-api-key
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Product Boundaries

Scoutly supports human review only. The frontend does not provide controls to post, comment, vote, message users, create Reddit accounts, or automate Reddit activity.

Opportunity details may show an AI-generated reply angle, risk note, and content idea. Users must open Reddit and write any reply themselves.
