# Scoutly

**AI-powered Reddit discovery for SaaS marketers.**

Scoutly scans Reddit 24/7, scores posts on buying intent, and tells you exactly which threads to reply to — and what to say.

## What it does

- **Monitors Reddit 24/7** — Set your keywords and subreddits once. Scoutly scans new posts around the clock.
- **AI intent scoring** — Every post is scored on buying intent, product fit, urgency, and engagement. Focus only on the top 5%.
- **Smart reply suggestions** — Get AI-suggested reply angles, what to avoid, and content opportunities for every high-intent thread.
- **Export & report** — Export opportunity reports as Markdown or CSV. Perfect for content planning and team reviews.

## How it works

![Architecture Diagram](docs/architecture.png)

1. **Discover** — Scoutly searches Reddit for posts matching your keywords across selected subreddits
2. **Filter** — Rule-based filtering removes low-quality and irrelevant posts
3. **Score** — An LLM scores each remaining post on 5 dimensions (buying intent, product fit, urgency, authority, engagement)
4. **Recommend** — The top-scoring posts appear in your dashboard with suggested reply angles
5. **Act** — You click through to Reddit and write a genuine, human comment

## Read-only by design

Scoutly is **strictly read-only**. It never:

- Posts comments or replies on Reddit
- Sends private messages
- Votes or interacts with content
- Creates or manages user accounts
- Stores full comment text or sensitive user data

We only read public posts and comments to surface relevant discussions for human review. All analysis happens on our servers — no actions are taken on Reddit's behalf.

## Tech stack

- **Backend**: FastAPI + Celery + PostgreSQL + Redis
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **AI**: DeepSeek LLM for intent scoring and reply suggestions
- **Deployment**: Docker Compose

## Project structure

```
├── scoutly-api/     # Backend (FastAPI)
│   ├── app/
│   │   ├── api/         # REST API endpoints
│   │   ├── services/    # Business logic
│   │   ├── integrations/ # Reddit API, LLM client
│   │   ├── workers/     # Celery async tasks
│   │   └── prompts/     # LLM prompt templates
│   └── alembic/         # Database migrations
│
└── scoutly-app/     # Frontend (React)
    └── src/
        ├── api/         # API client
        ├── components/  # UI components
        └── App.tsx      # Main app
```

## Data safety

- We store post titles, URLs, scores, and comment counts for up to 30 days
- We do not store full comment text or sensitive user profile data
- All Reddit data is read from public subreddits only
- We do not sell or share Reddit data with third parties

## License

This project is in early development. More details coming soon.
