# Scoutly

Scoutly is a read-only Reddit discovery and reporting tool for SaaS teams, indie founders, and marketing operators.

Users configure a product profile, keywords, competitors, and subreddit filters. Scoutly finds public Reddit discussions where people ask for recommendations, alternatives, comparisons, purchase validation, or workflow help. The system scores each candidate post, explains the scoring, and gives the user enough context to decide whether a human reply makes sense.

Scoutly helps users prioritize discussions. Users write and publish any Reddit reply themselves.

## Product Scope

- **Project setup**: Store product URL, description, keywords, competitors, included subreddits, and excluded subreddits.
- **Discovery**: Search approved Reddit API data for public posts that match the configured product category.
- **Filtering**: Remove duplicate posts, excluded communities, and low-signal candidates before LLM scoring.
- **Scoring**: Evaluate buying intent, product fit, search visibility, timing, and reply feasibility.
- **Review workflow**: Track opportunity status across `new`, `reviewing`, `replied`, `skipped`, and `watch`.
- **Reporting**: Export Markdown and CSV reports for client review, content planning, or team handoff.

## Reddit API And Data Policy

Scoutly is designed for Reddit-approved API access in production. Production deployments should use OAuth or another access method approved by Reddit.

The anonymous `.json` client exists as a local development fallback while API approval is pending. Do not use it as the data path for a commercial deployment.

Scoutly keeps Reddit engagement under human control:

- Users open Reddit and write replies themselves.
- Scoutly does not post comments, send messages, vote, or create accounts.
- Scoutly does not automate engagement or ranking manipulation.

Scoutly limits data use:

- The system stores only the fields needed for reports, scoring review, and de-duplication.
- The system does not store full comment histories.
- The system does not train or fine-tune AI models on Reddit data.
- The system does not sell, license, or redistribute raw Reddit datasets.
- The system does not infer sensitive traits or match Reddit users to off-platform identities.

Current storage targets include post title, permalink, subreddit, timestamp, score metadata, comment count, opportunity status, and analysis output. The retention target is up to 30 days unless Reddit requires a shorter period.

## System Flow

![Architecture Diagram](scoutly-app/docs/architecture.png)

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy async, Celery, PostgreSQL, Redis
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **AI**: DeepSeek-compatible OpenAI API client
- **Deployment**: Docker Compose for local services

## Project Structure

```text
├── scoutly-api/       # FastAPI backend, database models, scan workers
│   ├── app/
│   │   ├── api/          # REST endpoints
│   │   ├── services/     # Business logic
│   │   ├── integrations/ # Reddit and LLM clients
│   │   ├── workers/      # Celery scan tasks
│   │   └── prompts/      # LLM prompts
│   └── alembic/          # Database migrations
│
└── scoutly-app/       # React frontend
    └── src/
        ├── api/          # API client
        ├── components/   # UI components
        └── App.tsx       # Main application shell
```

## Local Development

Start backend dependencies:

```bash
cd scoutly-api
docker-compose up -d db redis
```

Start the API:

```bash
cd scoutly-api
cp .env.example .env
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the worker:

```bash
cd scoutly-api
celery -A app.workers.celery_app.celery worker --loglevel=info --concurrency=2
```

Start the frontend:

```bash
cd scoutly-app
npm install
npm run dev
```

## Documentation

- [Backend README](scoutly-api/README.md)
- [Frontend README](scoutly-app/README.md)
- [Deployment guide](scoutly-app/docs/deployment.md)
- [API integration guide](scoutly-app/docs/api-integration.md)
- [Testing guide](scoutly-app/docs/testing-guide.md)
- [User guide](scoutly-app/docs/user-guide.md)

## License

This project is in early development.
