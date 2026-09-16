# Scoutly API

Backend API for Scoutly, a read-only Reddit discovery tool for SaaS teams.

Scoutly finds public Reddit posts where people ask for recommendations, alternatives, comparisons, or workflow help. It scores each post and stores a short analysis for human review.

Scoutly does not post, comment, vote, send private messages, create Reddit accounts, or automate Reddit activity.

## Tech Stack

- **Framework**: FastAPI + Python 3.11+
- **Database**: PostgreSQL 16+
- **ORM**: SQLAlchemy 2.0 async
- **Migrations**: Alembic
- **Queue**: Celery + Redis
- **Reddit access**: Approved Reddit API access for production
- **LLM**: DeepSeek-compatible OpenAI API client

## Reddit API Notes

Production use should run through Reddit-approved API access, such as OAuth after approval.

The anonymous `.json` client in `app/integrations/reddit_client.py` is a development fallback while API approval is pending. Do not present it as the production data path for a commercial product.

Data handling rules for this project:

- Store only the fields needed for reports and de-duplication.
- Do not store full comment histories.
- Do not train or fine-tune AI models on Reddit data.
- Do not sell, license, or redistribute raw Reddit data.
- Do not infer sensitive traits or match Reddit users to off-platform identities.
- Keep all Reddit engagement human-controlled.

## Quick Start

### 1. Prepare Environment

```bash
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and add the required API keys.

### 2. Start PostgreSQL And Redis

```bash
docker-compose up -d db redis
```

### 3. Run Migrations

```bash
alembic upgrade head
```

### 4. Start API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: `http://localhost:8000/docs`

### 5. Start Celery Worker

```bash
celery -A app.workers.celery_app.celery worker --loglevel=info --concurrency=2
```

### Docker

```bash
docker-compose up -d
docker-compose exec api alembic upgrade head
```

## API Overview

Base URL: `http://localhost:8000/api/v1`

Authentication: `X-API-Key: <your-api-key>`

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List projects with stats |
| POST | `/projects` | Create project |
| GET | `/projects/{id}` | Get project |
| PATCH | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project |

### Scans

| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/scan` | Start async scan |
| GET | `/scans/{id}` | Get scan progress |
| GET | `/projects/{id}/scans` | List scan history |

### Opportunities

| Method | Path | Description |
|---|---|---|
| GET | `/projects/{id}/opportunities` | List opportunities |
| GET | `/opportunities/{id}` | Get opportunity details |
| PATCH | `/opportunities/{id}` | Update status |
| POST | `/projects/{id}/export` | Export Markdown or CSV report |

## Scoring

| Dimension | Max | Description |
|---|---:|---|
| buying_intent | 30 | Recommendation, alternative, comparison, or purchase intent |
| product_fit | 20 | Match between the post and the product |
| search_visibility | 20 | Long-tail search value |
| timing | 15 | Freshness and discussion window |
| reply_feasibility | 15 | Whether a helpful human reply fits the thread |

Priority:

- `high`: total score >= 80 and `buying_intent >= 20`
- `medium`: total score 60 to 79
- `watch`: total score below 60

## Scan Flow

```text
Create scan
-> generate search queries
-> fetch candidate posts through approved Reddit API access
-> filter and de-duplicate
-> score candidates with LLM
-> store opportunities
-> expose results through API
```

Scans run through Celery. The frontend polls `GET /scans/{id}` for progress.

## Environment Variables

See `.env.example`.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | required |
| `DEEPSEEK_API_KEY` | LLM API key | required |
| `DEEPSEEK_MODEL` | LLM model | `deepseek-v4-flash` |
| `REDDIT_AUTH_MODE` | Reddit access mode | `anonymous` for development fallback |
| `API_KEY` | API auth key | `dev-api-key` |

For approved OAuth access, configure `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and the required OAuth settings.

## Development

Run tests:

```bash
pytest
```

Format and lint:

```bash
ruff check .
black .
```

## License

MIT
