# Scoutly App

Scoutly App is the React frontend for the Scoutly Reddit discovery workspace. It gives users a project sidebar, opportunity table, detail drawer, scan progress view, settings page, and export dialog.

The frontend presents Reddit opportunities for human review. It does not include controls for posting, commenting, voting, messaging, account creation, or automated Reddit engagement.

## Product Views

- **Projects sidebar**: Switch between configured products and start a new project.
- **Opportunities**: Review scored Reddit posts, filter by status or priority, and update review status.
- **Opportunity detail**: Read the post summary, score breakdown, reply angle, risk note, and content idea.
- **Scan progress**: Track query generation, candidate collection, de-duplication, and scoring progress.
- **Project settings**: Edit product URL, description, keywords, competitors, and subreddit filters.
- **Export report**: Download Markdown or CSV reports from backend export endpoints.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- Base UI primitives
- lucide-react
- oxlint

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

The app reads the backend URL from `VITE_API_BASE_URL`. If the variable is not set, it uses `http://127.0.0.1:8000/api/v1`.

Example `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_API_KEY=dev-api-key
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite development server |
| `npm run build` | Type-check and build production assets |
| `npm run lint` | Run oxlint |
| `npm run preview` | Preview production build locally |

## API Integration

The frontend uses [src/api/client.ts](src/api/client.ts) for all backend calls:

- `GET /projects`
- `POST /projects`
- `PATCH /projects/{id}`
- `POST /projects/{id}/scan`
- `GET /scans/{id}`
- `GET /projects/{id}/opportunities`
- `GET /opportunities/{id}`
- `PATCH /opportunities/{id}`
- `POST /projects/{id}/export`

The client sends `X-API-Key` when `VITE_API_KEY` exists.

## UI Boundaries

Opportunity details may show an AI-generated reply angle, risk note, and content idea. The user opens Reddit and writes any reply outside Scoutly.

The interface should keep this boundary clear: Scoutly helps users decide where to participate; it does not participate for them.
