# ThreadScout 前后端对接文档

> 版本：v1.0  
> 更新日期：2026-09-04  
> 适用范围：前端 React 应用 ↔ 后端 FastAPI 服务

---

## 1. 架构概览

```
┌─────────────────┐     HTTP/JSON      ┌─────────────────┐
│   前端 (React)  │ ◄────────────────► │  后端 (FastAPI) │
│  :5173 (dev)    │                    │   :8000          │
│  静态文件 (prod) │                    │                  │
└─────────────────┘                    └────────┬────────┘
                                                  │
                        ┌───────────┬─────────────┼─────────────┐
                        ▼           ▼             ▼             ▼
                  PostgreSQL    Redis        Celery Worker   DeepSeek LLM
                  :5432         :6379        异步扫描任务     评分引擎
```

**数据流：**
1. 前端调用后端 API 获取项目列表、机会列表
2. 触发扫描时，后端创建 Celery 异步任务，立即返回 scan_id
3. 前端轮询 `/scans/{scan_id}` 获取进度
4. Celery Worker 执行扫描：Reddit 拉取 → 规则粗筛 → LLM 精评 → 入库
5. 扫描完成后，前端刷新机会列表

---

## 2. API 基础信息

### 2.1 Base URL

| 环境 | Base URL |
|---|---|
| 本地开发 | `http://127.0.0.1:8000/api/v1` |
| 生产部署 | `https://your-domain.com/api/v1` |

前端通过环境变量 `VITE_API_BASE_URL` 配置，默认值为 `http://127.0.0.1:8000/api/v1`。

### 2.2 认证

所有接口需要 `X-API-Key` 请求头。

- 开发环境（`APP_ENV=development`）：未设置 API Key 时自动放行
- 生产环境：必须设置 `API_KEY` 环境变量，前端通过 `VITE_API_KEY` 传入

```http
X-API-Key: your-api-key
Content-Type: application/json
```

### 2.3 错误格式

```json
{
  "detail": "错误描述信息"
}
```

| HTTP 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 创建成功 |
| 202 | 已接受（异步任务已创建） |
| 204 | 删除成功（无返回体） |
| 400 | 请求参数错误 |
| 401 | 未认证（API Key 缺失或错误） |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 3. 接口列表

### 3.1 项目管理

#### 获取项目列表

```
GET /api/v1/projects
```

**响应：** `ProjectListItem[]`

```json
[
  {
    "id": "ac5f4f3d-1c87-437f-9268-a0bf3708395c",
    "name": "PostPilot",
    "url": "https://postpilot.example",
    "description": "An AI tool for Reddit marketing",
    "created_at": "2026-09-03T10:00:00Z",
    "total_opportunities": 84,
    "high_priority_count": 12,
    "last_scan_status": "completed",
    "last_scan_at": "2026-09-03T12:00:00Z"
  }
]
```

#### 创建项目

```
POST /api/v1/projects
Content-Type: application/json
```

**请求体：**

```json
{
  "name": "PostPilot",
  "url": "https://postpilot.example",
  "description": "An AI tool for Reddit marketing",
  "keywords": ["reddit marketing", "ai seo"],
  "competitors": ["GummySearch", "Syften"],
  "include_subreddits": ["SaaS", "startups"],
  "exclude_subreddits": ["funny", "memes"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | ✅ | 项目名称 |
| url | string | ❌ | 产品 URL |
| description | string | ❌ | 产品描述 |
| keywords | string[] | ❌ | 关键词列表（用于生成搜索 query） |
| competitors | string[] | ❌ | 竞品列表 |
| include_subreddits | string[] | ❌ | 包含的 subreddit（不带 r/ 前缀） |
| exclude_subreddits | string[] | ❌ | 排除的 subreddit（不带 r/ 前缀） |

**响应：** `Project`（201 Created）

#### 获取项目详情

```
GET /api/v1/projects/{project_id}
```

**响应：** `Project`

#### 更新项目

```
PATCH /api/v1/projects/{project_id}
```

请求体同创建项目，所有字段可选。

#### 删除项目

```
DELETE /api/v1/projects/{project_id}
```

**响应：** 204 No Content

---

### 3.2 扫描管理

#### 触发扫描

```
POST /api/v1/projects/{project_id}/scan
```

**响应：** 202 Accepted

```json
{
  "scan_id": "uuid",
  "status": "pending",
  "message": "Scan task queued"
}
```

触发后立即返回，扫描在后台 Celery Worker 中异步执行。前端应启动轮询。

#### 获取扫描进度

```
GET /api/v1/scans/{scan_id}
```

**响应：** `Scan`

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "status": "running",
  "progress": {
    "queries_generated": 30,
    "candidates_fetched": 150,
    "duplicates_removed": 45,
    "opportunities_scored": 42,
    "total_to_score": 105
  },
  "started_at": "2026-09-03T12:00:00Z",
  "completed_at": null,
  "error_message": null,
  "created_at": "2026-09-03T11:59:58Z"
}
```

**status 枚举值：**

| 值 | 说明 |
|---|---|
| pending | 任务已入队，等待执行 |
| running | 正在执行 |
| completed | 扫描完成 |
| failed | 扫描失败（查看 error_message） |

**进度百分比计算：** `progress.opportunities_scored / progress.total_to_score * 100`

#### 获取项目扫描历史

```
GET /api/v1/projects/{project_id}/scans
```

**响应：** `Scan[]`

---

### 3.3 机会管理

#### 获取机会列表

```
GET /api/v1/projects/{project_id}/opportunities
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| page | int | 1 | 页码 |
| page_size | int | 20 | 每页数量 |
| status | string | — | 按状态筛选（见枚举值） |
| priority | string | — | 按优先级筛选（high/medium/watch） |
| intent_type | string | — | 按意图类型筛选 |
| sort | string | score | 排序字段（score/created_at/posted_at/num_comments） |
| order | string | desc | 排序方向（asc/desc） |
| search | string | — | 按标题搜索 |

**响应：**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Best tool for finding Reddit posts?",
      "url": "https://reddit.com/r/SaaS/comments/xxx",
      "subreddit": "SaaS",
      "score": 92,
      "priority": "high",
      "intent_type": "recommendation",
      "risk_level": "low",
      "status": "new",
      "num_comments": 41,
      "posted_at": "2026-09-03T08:00:00Z",
      "summary": "Founder wants a tool to find relevant Reddit conversations."
    }
  ],
  "total": 84,
  "page": 1,
  "page_size": 20
}
```

> 注意：列表接口返回的是 `OpportunityListItem`（精简字段），不含评分明细和建议角度。详情需调用详情接口。

#### 获取机会详情

```
GET /api/v1/opportunities/{opportunity_id}
```

**响应：** `Opportunity`（完整字段）

```json
{
  "id": "uuid",
  "scan_id": "uuid",
  "project_id": "uuid",
  "reddit_post_id": "abc123",
  "title": "Best tool for finding Reddit posts?",
  "url": "https://reddit.com/r/SaaS/comments/xxx",
  "subreddit": "SaaS",
  "author": "username",
  "selftext": "完整帖子正文...",
  "num_comments": 41,
  "upvote_ratio": 0.85,
  "posted_at": "2026-09-03T08:00:00Z",
  "score": 92,
  "priority": "high",
  "intent_type": "recommendation",
  "risk_level": "low",
  "status": "new",
  "summary": "帖子摘要...",
  "suggested_angle": "建议回复角度...",
  "what_not_to_do": "注意事项...",
  "content_opportunity": "内容机会...",
  "score_breakdowns": [
    {
      "dimension": "buying_intent",
      "score": 29,
      "max_score": 30,
      "note": "直接求推荐工具"
    }
  ],
  "created_at": "2026-09-03T12:00:00Z",
  "updated_at": "2026-09-03T12:00:00Z"
}
```

#### 更新机会状态

```
PATCH /api/v1/opportunities/{opportunity_id}
Content-Type: application/json
```

**请求体：**

```json
{
  "status": "reviewing"
}
```

**响应：** `Opportunity`（更新后的完整对象）

---

### 3.4 导出

#### 导出机会报告

```
POST /api/v1/projects/{project_id}/export
Content-Type: application/json
```

**请求体：**

```json
{
  "format": "markdown",
  "range": "all",
  "status_filter": ["new", "reviewing"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| format | string | ✅ | 导出格式：`markdown` / `csv` |
| range | string | ❌ | 导出范围：`all` / `high`（仅高优先级） |
| status_filter | string[] | ❌ | 按状态筛选 |

**响应：** 文件流（`Content-Type: text/markdown` 或 `text/csv`）

前端处理方式：接收 Blob，创建下载链接触发浏览器下载。

---

## 4. 数据模型

### 4.1 枚举值

**priority（优先级）：**

| 值 | 判定规则 |
|---|---|
| high | total >= 80 且 buying_intent >= 20 |
| medium | total 60-79 |
| watch | total < 60 |

**status（状态）：**

| 值 | 说明 |
|---|---|
| new | 新建，未处理 |
| reviewing | 正在审核 |
| replied | 已回复 |
| skipped | 已跳过 |
| watch | 持续关注 |

**risk_level（风险等级）：**

| 值 | 判定规则 |
|---|---|
| high | 社区对营销敏感 / reply_feasibility < 8 |
| medium | 需谨慎措辞，不能直接推产品 |
| low | 可自然提及产品（需披露关联） |

**intent_type（意图类型）：**

| 值 | 说明 |
|---|---|
| recommendation | 求推荐 |
| alternative | 找替代品 |
| comparison | 对比选型 |
| purchase_validation | 购买验证 |
| pain_point | 痛点描述 |
| workflow_advice | 流程咨询 |
| other | 其他 |

**scan.status（扫描状态）：**

| 值 | 说明 |
|---|---|
| pending | 已入队 |
| running | 执行中 |
| completed | 已完成 |
| failed | 失败 |

### 4.2 五维评分

| 维度 | 满分 | 说明 |
|---|---|---|
| buying_intent | 30 | 购买/选型意图强度 |
| product_fit | 20 | 与产品的匹配度 |
| search_visibility | 20 | 标题的 SEO 长尾价值 |
| timing | 15 | 回复时机 |
| reply_feasibility | 15 | 安全回复可行性 |
| **合计** | **100** | |

---

## 5. 前端对接说明

### 5.1 API 客户端

前端封装在 `src/api/client.ts`，导出 `api` 对象和所有 TypeScript 类型。

```typescript
import { api, type ProjectListItem, type Opportunity } from "./api/client"

// 获取项目列表
const projects = await api.listProjects()

// 触发扫描
const result = await api.triggerScan(projectId)

// 轮询进度
const scan = await api.getScan(result.scan_id)

// 获取机会列表
const response = await api.listOpportunities(projectId, { status: "new", priority: "high" })

// 获取详情
const detail = await api.getOpportunity(opportunityId)

// 更新状态
await api.updateOpportunityStatus(opportunityId, "reviewing")

// 导出
await api.exportOpportunities(projectId, "markdown", "all")
```

### 5.2 环境变量

在前端项目根目录创建 `.env` 文件：

```env
# 后端 API 地址（可选，默认 http://127.0.0.1:8000/api/v1）
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1

# API Key（开发环境可选，生产环境必填）
VITE_API_KEY=your-api-key
```

### 5.3 扫描轮询模式

前端触发扫描后的标准流程：

```typescript
// 1. 触发扫描
const result = await api.triggerScan(projectId)

// 2. 启动轮询（每 3 秒一次）
const poll = setInterval(async () => {
  const scan = await api.getScan(result.scan_id)
  
  if (scan.status === "completed") {
    clearInterval(poll)
    // 刷新机会列表
    await loadOpportunities()
  } else if (scan.status === "failed") {
    clearInterval(poll)
    // 显示错误
    console.error(scan.error_message)
  } else {
    // 更新进度条
    const percent = scan.progress.total_to_score > 0
      ? Math.round(scan.progress.opportunities_scored / scan.progress.total_to_score * 100)
      : 0
  }
}, 3000)
```

### 5.4 前后端数据格式差异

后端使用小写枚举值，前端显示时需转换：

| 后端值 | 前端显示 |
|---|---|
| high | High |
| medium | Medium |
| new | New |
| reviewing | Reviewing |
| replied | Replied |
| pain_point | Pain point |
| buying_intent | Buying intent |

前端在 `App.tsx` 中通过 `capitalize()` 函数和 `formatRelativeTime()` 函数处理转换。

---

## 6. 常见问题

### Q: 前端调用 API 报 CORS 错误？

A: 后端 `main.py` 已配置 CORS 中间件，允许所有来源（开发环境）。生产环境应在 `main.py` 中限制 `allow_origins`。

### Q: 触发扫描后一直 pending？

A: 检查 Celery Worker 是否在运行：
```bash
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo
```

### Q: 扫描失败，error_message 显示 Reddit 请求超时？

A: 匿名模式速率限制约 10 次/分钟。检查网络是否能访问 Reddit，必要时增大 `SCAN_REQUEST_INTERVAL`。

### Q: LLM 评分返回空或解析失败？

A: 检查 DeepSeek API Key 是否正确，余额是否充足。查看后端日志中的 LLM 原始输出。

### Q: 前端列表不显示数据？

A: 检查浏览器 Network 面板，确认 API 请求返回 200。确认项目已执行过扫描（新项目机会列表为空）。

---

## 7. 接口速查表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/projects` | 获取项目列表 |
| POST | `/projects` | 创建项目 |
| GET | `/projects/{id}` | 获取项目详情 |
| PATCH | `/projects/{id}` | 更新项目 |
| DELETE | `/projects/{id}` | 删除项目 |
| POST | `/projects/{id}/scan` | 触发扫描 |
| GET | `/scans/{id}` | 获取扫描进度 |
| GET | `/projects/{id}/scans` | 获取扫描历史 |
| GET | `/projects/{id}/opportunities` | 获取机会列表 |
| GET | `/opportunities/{id}` | 获取机会详情 |
| PATCH | `/opportunities/{id}` | 更新机会状态 |
| POST | `/projects/{id}/export` | 导出报告 |
