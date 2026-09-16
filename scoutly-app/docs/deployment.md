# ThreadScout 部署文档

> 版本：v1.0  
> 更新日期：2026-09-04  
> 适用范围：本地开发环境 / 生产服务器部署

---

## 1. 环境要求

### 1.1 后端

| 组件 | 最低版本 | 推荐版本 |
|---|---|---|
| Python | 3.10 | 3.11+ |
| PostgreSQL | 14 | 16+ |
| Redis | 6.0 | 7.0+ |
| Node.js（前端构建） | 18 | 20+ |

### 1.2 前端

| 组件 | 最低版本 | 推荐版本 |
|---|---|---|
| Node.js | 18 | 20+ |
| npm | 9 | 10+ |

### 1.3 外部服务

| 服务 | 用途 | 是否必须 |
|---|---|---|
| DeepSeek API | LLM 评分引擎 | ✅ 必须 |
| Reddit（匿名模式） | 帖子数据源 | ✅ 必须（可访问 reddit.com） |
| Reddit OAuth API | 高速率数据源 | ❌ 可选（需审批） |

---

## 2. 项目结构

```
threadscout/
├── threadscout-api/          # 后端服务
│   ├── app/
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 配置管理
│   │   ├── database.py       # 数据库连接
│   │   ├── deps.py           # 认证依赖
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic 模型
│   │   ├── api/v1/           # API 路由
│   │   ├── services/         # 业务服务层
│   │   ├── workers/          # Celery 异步任务
│   │   ├── integrations/     # 外部集成（Reddit/LLM）
│   │   └── prompts/          # LLM Prompt 模板
│   ├── alembic/              # 数据库迁移
│   ├── .env                  # 环境变量（需创建）
│   ├── .env.example          # 环境变量模板
│   ├── requirements.txt      # Python 依赖
│   ├── docker-compose.yml    # Docker 编排
│   ├── Dockerfile            # Docker 镜像
│   └── README.md            # 后端开发说明
│
└── threadscout-app/          # 前端应用
    ├── src/
    │   ├── App.tsx           # 主应用（单文件）
    │   ├── api/client.ts     # API 客户端
    │   └── ...
    ├── .env                  # 前端环境变量（需创建）
    ├── package.json
    ├── vite.config.ts
    └── ...
```

---

## 3. 本地开发部署（手动方式）

### 3.1 克隆项目

```bash
git clone <repository-url>
cd threadscout
```

### 3.2 启动 PostgreSQL

**方式一：本地已安装 PostgreSQL**

```bash
# 创建数据库和用户
psql -U postgres
```

```sql
CREATE USER threadscout WITH PASSWORD 'threadscout';
CREATE DATABASE threadscout OWNER threadscout;
GRANT ALL PRIVILEGES ON DATABASE threadscout TO threadscout;
\q
```

**方式二：Docker 启动 PostgreSQL**

```bash
docker run -d \
  --name threadscout-db \
  -e POSTGRES_USER=threadscout \
  -e POSTGRES_PASSWORD=threadscout \
  -e POSTGRES_DB=threadscout \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3.3 启动 Redis

**方式一：本地已安装 Redis**

```bash
redis-server
```

**方式二：Docker 启动 Redis**

```bash
docker run -d \
  --name threadscout-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 3.4 配置后端环境变量

```bash
cd threadscout-api
cp .env.example .env
```

编辑 `.env` 文件，至少修改以下配置：

```env
# DeepSeek API Key（必须）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# Reddit 匿名模式（默认，不需要修改）
REDDIT_AUTH_MODE=anonymous

# 开发环境 API Key 认证（开发环境可省略）
APP_ENV=development
```

### 3.5 安装 Python 依赖

```bash
cd threadscout-api

# 创建虚拟环境（推荐）
python -m venv venv

# Windows 激活虚拟环境
venv\Scripts\activate

# macOS/Linux 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

> **Windows 注意**：如果 `python` 命令指向沙箱 Python，请使用完整路径，例如 `C:\Users\username\AppData\Local\Programs\Python\Python311\python.exe`

### 3.6 执行数据库迁移

```bash
cd threadscout-api

# 生成迁移（首次或模型变更后）
alembic revision --autogenerate -m "initial schema"

# 执行迁移
alembic upgrade head
```

验证表是否创建成功：

```bash
psql -U threadscout -d threadscout -c "\dt"
```

应看到以下表：
- `projects`
- `scans`
- `opportunities`
- `opportunity_score_breakdowns`
- `alembic_version`

### 3.7 启动后端 API 服务

```bash
cd threadscout-api

# 激活虚拟环境
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# 启动 FastAPI
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

验证：

```bash
curl http://127.0.0.1:8000/health
# 应返回 {"status": "ok"}
```

API 文档：http://127.0.0.1:8000/docs

### 3.8 启动 Celery Worker

新开一个终端窗口：

```bash
cd threadscout-api

# 激活虚拟环境
venv\Scripts\activate  # Windows

# 启动 Celery Worker（Windows 需 --pool=solo）
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo
```

验证：启动日志中应显示 `scan_project` 任务已注册。

### 3.9 配置前端环境变量

```bash
cd threadscout-app

# 创建 .env 文件
cat > .env << 'EOF'
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
EOF
```

### 3.10 安装前端依赖并启动

```bash
cd threadscout-app

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

验证：浏览器打开 http://127.0.0.1:5173/

---

## 4. Docker 部署（推荐）

### 4.1 配置环境变量

```bash
cd threadscout-api
cp .env.example .env
```

编辑 `.env`，填入 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

### 4.2 启动所有服务

```bash
cd threadscout-api
docker-compose up -d
```

这会启动：
- `api` — FastAPI 服务（端口 8000）
- `worker` — Celery Worker
- `db` — PostgreSQL（端口 5432）
- `redis` — Redis（端口 6379）

### 4.3 执行数据库迁移

```bash
docker-compose exec api alembic upgrade head
```

### 4.4 验证服务

```bash
# 查看服务状态
docker-compose ps

# 查看 API 日志
docker-compose logs -f api

# 查看 Worker 日志
docker-compose logs -f worker

# 健康检查
curl http://127.0.0.1:8000/health
```

### 4.5 构建前端并部署

```bash
cd threadscout-app
npm install
npm run build
```

构建产物在 `dist/` 目录，可部署到任意静态文件服务器（Nginx、Vercel、Netlify 等）。

**Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/threadscout/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 5. 配置说明

### 5.1 后端环境变量（.env）

| 变量 | 默认值 | 说明 |
|---|---|---|
| **应用** | | |
| APP_NAME | threadscout-api | 应用名称 |
| APP_ENV | development | 运行环境（development/production） |
| API_KEY | dev-api-key | API 认证密钥（生产环境必须修改） |
| **数据库** | | |
| DATABASE_URL | postgresql+asyncpg://... | 数据库连接字符串 |
| **Redis** | | |
| REDIS_URL | redis://localhost:6379/0 | Redis 连接字符串 |
| **Reddit** | | |
| REDDIT_AUTH_MODE | anonymous | 认证模式（anonymous/oauth） |
| REDDIT_CLIENT_ID | — | OAuth Client ID（oauth 模式必填） |
| REDDIT_CLIENT_SECRET | — | OAuth Client Secret（oauth 模式必填） |
| REDDIT_USER_AGENT | threadscout:v0.1 | User-Agent 标识 |
| REDDIT_USERNAME | — | Reddit 用户名（oauth 模式可选） |
| REDDIT_PASSWORD | — | Reddit 密码（oauth 模式可选） |
| **DeepSeek LLM** | | |
| DEEPSEEK_API_KEY | — | DeepSeek API Key（必须） |
| DEEPSEEK_BASE_URL | https://api.deepseek.com/v1 | API 地址 |
| DEEPSEEK_MODEL | deepseek-v4-flash | 模型名称 |
| LLM_TEMPERATURE | 0.3 | 采样温度 |
| LLM_MAX_TOKENS | 2000 | 最大输出 token 数 |
| **扫描配置** | | |
| SCAN_DEFAULT_TIME_FILTER | month | Reddit 搜索时间范围（hour/day/week/month/year/all） |
| SCAN_MAX_QUERIES | 30 | 最大生成 query 数 |
| SCAN_MAX_CANDIDATES | 100 | 每个 query 最大拉取帖子数 |
| SCAN_REQUEST_INTERVAL | 1.5 | Reddit 请求间隔（秒，防止触发速率限制） |

### 5.2 前端环境变量（.env）

| 变量 | 默认值 | 说明 |
|---|---|---|
| VITE_API_BASE_URL | http://127.0.0.1:8000/api/v1 | 后端 API 地址 |
| VITE_API_KEY | — | API Key（生产环境必填） |

---

## 6. 生产环境注意事项

### 6.1 安全配置

1. **修改 API Key**：生产环境必须设置强密码
   ```env
   APP_ENV=production
   API_KEY=your-strong-random-key
   ```

2. **配置 CORS**：编辑 `app/main.py`，限制允许的来源
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["https://your-domain.com"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

3. **数据库密码**：使用强密码，不要用默认的 `threadscout`

4. **HTTPS**：生产环境必须使用 HTTPS，通过 Nginx 或云服务商配置 SSL 证书

### 6.2 性能配置

1. **Celery 并发**：生产环境增加 worker 并发数
   ```bash
   celery -A app.workers.celery_app.celery worker --loglevel=info --concurrency=4
   ```

2. **数据库连接池**：根据负载调整 `DATABASE_URL` 中的连接池参数

3. **Redis 持久化**：生产环境配置 Redis RDB/AOF 持久化

### 6.3 监控与日志

1. **查看 API 日志**：`docker-compose logs -f api`
2. **查看 Worker 日志**：`docker-compose logs -f worker`
3. **健康检查端点**：`GET /health`
4. **建议集成**：Sentry（错误追踪）、Prometheus + Grafana（指标监控）

### 6.4 备份

1. **数据库备份**：
   ```bash
   pg_dump -U threadscout threadscout > backup_$(date +%Y%m%d).sql
   ```

2. **恢复**：
   ```bash
   psql -U threadscout threadscout < backup_20260904.sql
   ```

---

## 7. 服务管理命令

### 7.1 本地开发

```bash
# 启动所有服务（需要多个终端）
# 终端 1：PostgreSQL（如已安装为服务则自动运行）
# 终端 2：Redis
redis-server

# 终端 3：后端 API
cd threadscout-api
venv\Scripts\activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 终端 4：Celery Worker
cd threadscout-api
venv\Scripts\activate
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo

# 终端 5：前端
cd threadscout-app
npm run dev
```

### 7.2 Docker

```bash
# 启动
docker-compose up -d

# 停止
docker-compose down

# 重启
docker-compose restart

# 查看日志
docker-compose logs -f api
docker-compose logs -f worker

# 重新构建（代码变更后）
docker-compose build
docker-compose up -d
```

---

## 8. 验证清单

部署完成后，按以下清单验证：

### 8.1 后端验证

- [ ] `GET /health` 返回 `{"status": "ok"}`
- [ ] `GET /docs` 可访问 Swagger UI
- [ ] `POST /api/v1/projects` 可创建项目
- [ ] `GET /api/v1/projects` 返回项目列表
- [ ] 数据库表已创建（`\dt` 查看）

### 8.2 扫描验证

- [ ] Celery Worker 日志显示 `scan_project` 任务已注册
- [ ] `POST /api/v1/projects/{id}/scan` 返回 202
- [ ] `GET /api/v1/scans/{id}` 状态从 pending → running → completed
- [ ] 扫描完成后机会列表有数据

### 8.3 前端验证

- [ ] 浏览器打开前端地址无白屏
- [ ] 侧边栏显示项目列表
- [ ] 点击项目显示机会列表
- [ ] 点击 Run scan 触发扫描
- [ ] 扫描进度页显示真实进度
- [ ] 点击机会行打开详情抽屉
- [ ] 状态切换生效
- [ ] 导出报告可下载

### 8.4 LLM 验证

- [ ] DeepSeek API Key 有效
- [ ] 扫描时 LLM 调用成功（查看 Worker 日志）
- [ ] 机会有 score、priority、intent_type 等字段
- [ ] 详情页有 score_breakdowns 五维评分

---

## 9. 故障排查

### 9.1 后端启动失败

**症状：** `uvicorn` 启动报错

**排查：**
1. 检查 Python 版本：`python --version`（需 3.10+）
2. 检查依赖是否安装：`pip list | grep fastapi`
3. 检查 `.env` 文件是否存在
4. 检查数据库是否可连接：`psql -h localhost -U threadscout -d threadscout`
5. 检查 Redis 是否可连接：`redis-cli ping`

### 9.2 扫描一直 pending

**症状：** 触发扫描后状态一直是 pending

**原因：** Celery Worker 未启动或未连接到 Redis

**排查：**
1. 确认 Celery Worker 进程在运行
2. 查看 Worker 日志是否有报错
3. 确认 Redis 连接正常
4. 确认 `.env` 中 `REDIS_URL` 正确

### 9.3 扫描失败

**症状：** scan.status = failed，error_message 有错误

**常见原因：**

| 错误 | 原因 | 解决 |
|---|---|---|
| Reddit request timeout | 网络无法访问 Reddit | 检查 VPN/代理，增大 SCAN_REQUEST_INTERVAL |
| LLM API error | DeepSeek Key 无效或余额不足 | 检查 DEEPSEEK_API_KEY，确认余额 |
| JSON parse failed | LLM 输出格式错误 | 查看日志中的原始输出，通常是临时问题，重试即可 |
| Database error | 数据库连接失败 | 检查 PostgreSQL 状态和 DATABASE_URL |

### 9.4 前端无法连接后端

**症状：** 浏览器控制台报网络错误或 CORS 错误

**排查：**
1. 确认后端服务在运行：`curl http://127.0.0.1:8000/health`
2. 检查前端 `.env` 中 `VITE_API_BASE_URL` 正确
3. 检查后端 CORS 配置（`app/main.py`）
4. 浏览器 Network 面板查看具体请求和响应

### 9.5 数据库迁移失败

**症状：** `alembic upgrade head` 报错

**排查：**
1. 确认数据库已创建且用户有权限
2. 确认 `DATABASE_URL` 格式正确
3. 删除 `alembic_version` 表后重试（仅开发环境）
4. 查看完整错误信息定位问题

### 9.6 Windows 下 Celery 报错

**症状：** Celery Worker 启动报错或任务不执行

**解决：** Windows 下必须使用 `--pool=solo` 参数：
```bash
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo
```

---

## 10. 快速启动脚本（参考）

### Windows 开发环境一键启动（PowerShell）

```powershell
# start-dev.ps1
Write-Host "Starting ThreadScout development environment..." -ForegroundColor Green

# 启动 Redis（如已安装）
Start-Process redis-server -WindowStyle Minimized

# 启动后端 API
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd threadscout-api; venv\Scripts\activate; uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# 启动 Celery Worker
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd threadscout-api; venv\Scripts\activate; celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo"

# 启动前端
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd threadscout-app; npm run dev"

Write-Host "All services started!" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173/"
Write-Host "Backend API: http://127.0.0.1:8000"
Write-Host "API Docs: http://127.0.0.1:8000/docs"
```

---

## 附录：相关文档

- [后端技术方案](./backend-architecture.md)
- [前后端对接文档](./api-integration.md)
- [后端 README](../../scoutly-api/README.md)
