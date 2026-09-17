# Scoutly API

Scoutly API is the backend service for the Scoutly Reddit discovery workspace. It manages projects, runs scan jobs, stores scored opportunities, and exports reports for human review.

The service reads public Reddit data through approved API access in production. It does not publish Reddit content or perform Reddit account actions.

## Responsibilities

- Manage product discovery projects and subreddit filters.
- Create and track asynchronous scan jobs.
- Generate search queries from keywords and competitor names.
- Fetch candidate posts through the configured Reddit client.
- Filter, de-duplicate, score, and persist opportunities.
- Serve opportunity lists, details, status updates, and exports to the frontend.

## Tech Stack

- **Framework**: FastAPI + Python 3.11+
- **Database**: PostgreSQL 16+
- **ORM**: SQLAlchemy 2.0 async
- **Migrations**: Alembic
- **Queue**: Celery + Redis
- **LLM client**: OpenAI-compatible client configured for DeepSeek
- **Runtime packaging**: Docker Compose

## Reddit API And Data Handling

Production deployments should use Reddit-approved API access, such as OAuth after approval.

The current anonymous `.json` implementation in `app/integrations/reddit_client.py` supports local development while API approval is pending. Treat it as a temporary adapter, not a commercial data source.

The backend enforces a read-only product boundary:

- No Reddit posting, commenting, voting, messaging, or account creation.
- No automated engagement.
- No model training or fine-tuning on Reddit data.
- No resale, licensing, or redistribution of raw Reddit data.
- No sensitive-trait inference or off-platform identity matching.

Stored records focus on operational fields: title, permalink, subreddit, author handle where available, timestamp, score metadata, comment count, LLM analysis, and review status.

## Application Structure

```text
app/
├── api/v1/          # FastAPI routes
├── integrations/    # Reddit and LLM clients
├── models/          # SQLAlchemy models
├── prompts/         # LLM prompt templates
├── schemas/         # Pydantic request and response models
├── services/        # Business logic
├── workers/         # Celery app and scan task
├── config.py        # Environment configuration
├── database.py      # Async SQLAlchemy setup
└── main.py          # FastAPI entrypoint
```

## Quick Start

Install dependencies and configure environment:

```bash
pip install -r requirements.txt
cp .env.example .env
```

Start PostgreSQL and Redis:

```bash
docker-compose up -d db redis
```

Run migrations:

```bash
alembic upgrade head
```

Start the API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the worker:

```bash
celery -A app.workers.celery_app.celery worker --loglevel=info --concurrency=2
```

On Windows, use the solo pool:

```bash
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo
```

API docs: `http://localhost:8000/docs`

## Docker

```bash
docker-compose up -d
docker-compose exec api alembic upgrade head
```

Services:

- `api`: FastAPI service on port `8000`
- `worker`: Celery scan worker
- `db`: PostgreSQL
- `redis`: Redis broker

## API Overview

Base URL: `http://localhost:8000/api/v1`

Authentication: `X-API-Key: <your-api-key>`

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List projects with counts and last scan status |
| POST | `/projects` | Create a discovery project |
| GET | `/projects/{id}` | Get project configuration |
| PATCH | `/projects/{id}` | Update project configuration |
| DELETE | `/projects/{id}` | Delete project and related scans/opportunities |

### Scans

| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/scan` | Create a scan and enqueue a Celery task |
| GET | `/scans/{id}` | Read scan status and progress counters |
| GET | `/projects/{id}/scans` | List recent scans for a project |

### Opportunities

| Method | Path | Description |
|---|---|---|
| GET | `/projects/{id}/opportunities` | List opportunities with pagination, filtering, sorting, and search |
| GET | `/opportunities/{id}` | Read one opportunity with score breakdowns |
| PATCH | `/opportunities/{id}` | Update review status |
| POST | `/projects/{id}/export` | Export Markdown or CSV report |

## Scoring Model

| Dimension | Max | Description |
|---|---:|---|
| `buying_intent` | 30 | Strength of recommendation, comparison, alternative, or purchase intent |
| `product_fit` | 20 | Fit between the post and the configured product |
| `search_visibility` | 20 | Long-tail search value and discussion quality |
| `timing` | 15 | Freshness and remaining reply window |
| `reply_feasibility` | 15 | Whether a useful, low-risk human reply fits the thread |

Priority rules:

- `high`: total score >= 80 and `buying_intent >= 20`
- `medium`: total score 60 to 79
- `watch`: total score below 60

## Scan Flow

```text
POST /projects/{id}/scan
-> create Scan row
-> enqueue Celery task
-> load project configuration
-> generate queries
-> fetch public Reddit candidates
-> filter and de-duplicate
-> fetch limited comment context when needed
-> score with LLM
-> create Opportunity and ScoreBreakdown rows
-> mark scan completed or failed
```

The frontend polls `GET /scans/{id}` and refreshes opportunities when the scan completes.

## Environment Variables

See `.env.example`.

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Runtime environment | `development` |
| `API_KEY` | API authentication key | `dev-api-key` |
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | required |
| `REDDIT_AUTH_MODE` | Reddit adapter mode | `anonymous` development fallback |
| `REDDIT_CLIENT_ID` | OAuth client ID after approval | empty |
| `REDDIT_CLIENT_SECRET` | OAuth client secret after approval | empty |
| `DEEPSEEK_API_KEY` | LLM API key | required |
| `DEEPSEEK_BASE_URL` | OpenAI-compatible base URL | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | LLM model | `deepseek-v4-flash` |
| `SCAN_MAX_QUERIES` | Query cap per scan | `30` |
| `SCAN_MAX_CANDIDATES` | Candidate cap per query | `100` |
| `SCAN_REQUEST_INTERVAL` | Request spacing in seconds | `1.5` |

## Development

Run tests:

```bash
pytest
```

Run checks:

```bash
ruff check .
black .
```

## License

MIT
