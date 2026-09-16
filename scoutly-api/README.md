# ThreadScout API

Reddit 高意向帖子发现工具 - 后端 API

## 技术栈



* **框架**: FastAPI + Python 3.11+

* **数据库**: PostgreSQL 16+

* **ORM**: SQLAlchemy 2.0 (async)

* **迁移**: Alembic

* **任务队列**: Celery + Redis

* **Reddit 接入**: 匿名 .json 端点（可切换 OAuth/PRAW）

* **LLM**: DeepSeek V4 Flash（OpenAI 兼容接口）

## 快速开始

### 1. 环境准备



```
\# 安装依赖

pip install -r requirements.txt

\# 复制环境变量配置

cp .env.example .env

\# 编辑 .env，填入 DeepSeek API key 等配置
```

### 2. 启动依赖服务（PostgreSQL + Redis）



```
docker-compose up -d db redis
```

### 3. 数据库迁移



```
alembic upgrade head
```

### 4. 启动 API 服务



```
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档: [http://localhost:8000/docs](http://localhost:8000/docs)

### 5. 启动 Celery Worker（扫描任务）



```
celery -A app.workers.celery\_app.celery worker --loglevel=info --concurrency=2
```

### 一键启动（全部服务）



```
docker-compose up -d
```

## API 概览

Base URL: `http://localhost:8000/api/v1`

认证: Header `X-API-Key: <your-api-key>`（开发环境可省略）

### 项目管理



| 方法     | 路径               | 说明        |
| ------ | ---------------- | --------- |
| GET    | `/projects`      | 项目列表（含统计） |
| POST   | `/projects`      | 创建项目      |
| GET    | `/projects/{id}` | 项目详情      |
| PATCH  | `/projects/{id}` | 更新项目      |
| DELETE | `/projects/{id}` | 删除项目      |

### 扫描



| 方法   | 路径                     | 说明       |
| ---- | ---------------------- | -------- |
| POST | `/projects/{id}/scan`  | 触发扫描（异步） |
| GET  | `/scans/{id}`          | 扫描进度     |
| GET  | `/projects/{id}/scans` | 扫描历史     |

### 机会



| 方法    | 路径                             | 说明                 |
| ----- | ------------------------------ | ------------------ |
| GET   | `/projects/{id}/opportunities` | 机会列表（分页 / 筛选 / 排序） |
| GET   | `/opportunities/{id}`          | 机会详情（含评分明细）        |
| PATCH | `/opportunities/{id}`          | 更新状态               |
| POST  | `/projects/{id}/export`        | 导出报告（Markdown/CSV） |

## 项目结构



```
threadscout-api/

├── app/

│   ├── main.py              # FastAPI 入口

│   ├── config.py            # 配置管理

│   ├── database.py          # 数据库连接

│   ├── deps.py              # 依赖注入（认证等）

│   ├── models/              # SQLAlchemy 数据模型

│   ├── schemas/             # Pydantic 请求/响应模型

│   ├── api/v1/              # API 路由

│   ├── services/            # 业务逻辑层

│   ├── workers/             # Celery 异步任务

│   ├── integrations/        # 外部服务集成（Reddit/LLM）

│   └── prompts/             # LLM Prompt 模板

├── alembic/                 # 数据库迁移

├── tests/                   # 测试

├── .env.example             # 环境变量模板

├── docker-compose.yml       # Docker 编排

├── Dockerfile

├── requirements.txt

└── alembic.ini
```

## 评分维度



| 维度                 | 满分      | 说明           |
| ------------------ | ------- | ------------ |
| buying\_intent     | 30      | 购买 / 选型意图强度  |
| product\_fit       | 20      | 与产品的匹配度      |
| search\_visibility | 20      | 标题的 SEO 长尾价值 |
| timing             | 15      | 回复时机（新鲜度）    |
| reply\_feasibility | 15      | 安全回复的可行性     |
| **总分**             | **100** |              |

**优先级判定**:



* high: 总分 ≥ 80 且 buying\_intent ≥ 20

* medium: 总分 60-79

* watch: 总分 < 60

## 扫描流程



```
触发扫描 → 生成检索 query(20-30个) → Reddit API 拉取候选

→ 规则粗筛(关键词匹配/subreddit过滤/去重) → LLM 逐条评分

→ 写入数据库 → 完成
```



* 扫描异步执行（Celery）

* 前端通过 `GET /scans/{id}` 轮询进度

* 已评分的机会立即可查（不需要等全部完成）

## 环境变量

见 `.env.example`。关键配置：



| 变量                 | 说明               | 默认值               |
| ------------------ | ---------------- | ----------------- |
| `DATABASE_URL`     | PostgreSQL 连接串   | -                 |
| `REDIS_URL`        | Redis 连接串        | -                 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | -                 |
| `DEEPSEEK_MODEL`   | LLM 模型名          | deepseek-v4-flash |
| `REDDIT_AUTH_MODE` | Reddit 认证模式      | anonymous         |
| `API_KEY`          | API 认证密钥         | dev-api-key       |

## Reddit 接入模式

当前支持两种模式，通过 `REDDIT_AUTH_MODE` 切换：



1. **anonymous**（默认）: 使用 Reddit 公开 .json 端点，不需要注册应用，速率限制约 10 次 / 分钟

2. **oauth**: 使用 PRAW + OAuth 认证，需要注册 Reddit 开发者应用，速率限制 60 次 / 分钟

切换到 OAuth 模式需要在 `.env` 中填入 `REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`、`REDDIT_USERNAME`、`REDDIT_PASSWORD`。

## 开发说明

### 生成新的数据库迁移



```
alembic revision --autogenerate -m "description"

alembic upgrade head
```

### 运行测试



```
pytest
```

### 代码检查



```
ruff check .

black .
```

## 许可证

MIT