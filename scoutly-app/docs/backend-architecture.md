# ThreadScout 后端技术方案

> 版本：v0.2（草案，含业务逻辑章节）
> 日期：2026-09-03
> 状态：待审核



***

## 1. 项目概述

### 1.1 产品定位

ThreadScout 是一款面向 SaaS 创始人 / 独立开发者的 Reddit 高意向帖子发现工具。用户输入产品信息和关键词，系统自动扫描 Reddit，找出值得回复的高购买意向讨论，并给出回复角度建议和风险提示。

### 1.2 核心功能



* **项目管理**：创建项目，配置产品信息、关键词、竞品、subreddit 过滤

* **智能扫描**：基于关键词生成检索 query，拉取 Reddit 帖子，去重，AI 评分

* **机会列表**：按分数 / 优先级 / 状态筛选，支持分页和排序

* **详情分析**：五维评分明细、建议回复角度、风险提示、内容机会

* **状态管理**：New / Reviewing / Replied / Skipped / Watch

* **导出报告**：Markdown / CSV 格式导出

### 1.3 当前状态



* 前端 MVP：已完成（React + TypeScript + Tailwind + shadcn/ui），使用 demo 数据

* 后端：待开发（本文档为技术方案）

* Reddit API：开发者应用注册中

* LLM：已选定 DeepSeek V4 Flash，API key 已获取



***

## 2. 业务逻辑

### 2.1 核心价值主张

在 Reddit 每天的海量讨论中，精准找出 "用户正在做购买决策、且你的产品能安全参与" 的那一刻，帮用户把回复时间花在真正能带来用户的帖子上。

### 2.2 业务闭环（六步）



```
① 定义产品 → ② 发现讨论 → ③ 评估价值 → ④ 优先级排序 → ⑤ 辅助回复 → ⑥ 状态追踪
```

### 2.3 各环节业务逻辑

#### ① 定义产品（输入层）

用户不是简单填关键词，而是在回答一个问题：**"我的产品解决谁的什么问题？"**



* 产品描述 → LLM 判断帖子与产品的匹配度

* 关键词 → 生成检索 query 的基础

* 竞品 → 发现 "用户在对比竞品" 的帖子（最高意向场景）

* subreddit 过滤 → 排除明显不相关的社区

**业务逻辑**：输入越精准，后续评分越准。这不是配置表单，是在给 AI 建立 "产品认知"。

#### ② 发现讨论（发现层）

不是 "搜关键词然后全给你"，而是**模拟一个资深营销人员会怎么找机会**：



* 不只是搜产品名，还生成 `{keyword} alternative`、`{competitor} vs`、`best {keyword}`、`{keyword} review`、`looking for {keyword}` 等多维度 query

* 因为最高意向的帖子往往**不直接提你的产品名**，而是在泛泛地找解决方案

* 补充拉取高价值 subreddit 的 /new（搜索有遗漏，新帖可能还没被索引）

**业务逻辑**：发现层的目标是 "召回率"—— 宁可多捞一些候选（后面粗筛 + 精评会过滤），也不能漏掉一个高意向帖子。漏了就是用户流失。

#### ③ 评估价值（评估层）—— 核心

这是整个产品最关键的业务判断：**什么样的帖子 "值得回复"？**

不是 "提到了关键词"，而是同时满足以下五个条件：



| 维度                 | 满分 | 业务问题            | 低分反例                   |
| ------------------ | -- | --------------- | ---------------------- |
| buying\_intent     | 30 | 用户在做购买 / 选型决策吗？ | "大家聊聊 XX 行业"（闲聊，0 分）   |
| product\_fit       | 20 | 你的产品能解决这个问题吗？   | 用户要免费工具，你是付费 SaaS（5 分） |
| search\_visibility | 20 | 标题有长尾搜索价值吗？     | "救命！！！"（无搜索价值，2 分）     |
| timing             | 15 | 现在回复还来得及吗？      | 3 个月前的老帖，楼主早买了（3 分）    |
| reply\_feasibility | 15 | 能安全回复不被当垃圾广告吗？  | 反营销社区，回就被 ban（2 分）     |

**为什么是五维而不是一个总分？** 任何一维不及格，这个机会就没价值：



* 购买意图高但产品不匹配 → 回了也白回

* 产品匹配但购买意图低 → 教育成本太高，不如等用户主动找

* 各方面都好但时机过了 → 楼主已经做了决策

* 各方面都好但社区反营销 → 回复会损害品牌

**业务逻辑**：五维评分不是技术设计，是业务判断的结构化。每个维度对应一个 "这个机会值不值得花时间" 的真实问题。

#### ④ 优先级排序（决策层）

评分之后，用户面对几十条机会，**先回哪个？**



* **high**（总分 ≥ 80 且 buying\_intent ≥ 20）：今天必须回，用户正在做决策，晚了就被竞品抢了

* **medium**（60-79 分）：本周内回，有价值但不紧急

* **watch**（< 60 分）：先放着，可能后续有变化

**业务逻辑**：优先级不是 "质量分级"，是 "行动 urgency 分级"。high = 今天不回就可能失去这个用户。这是 triage（分诊）逻辑，类似急诊室：先救最急的。

#### ⑤ 辅助回复（执行层）

用户点开一条 high 机会，系统不只是给数据，而是**直接告诉用户怎么回**：



* **suggested\_angle**：具体的回复角度（"先认可楼主的痛点，给出 3 个选型标准，最后自然提到你的产品符合这些标准"）

* **what\_not\_to\_do**：风险提示（"这个社区禁止直接贴链接，不要在第一条评论就推产品，先给价值"）

* **content\_opportunity**：延伸价值（"很多人问这个问题，可以写一篇《XX 选型指南》博客捕获搜索流量"）

**业务逻辑**：产品的差异化不是 "找到帖子"（GummySearch、Syften 都能做），而是**告诉用户怎么安全、有效地回复**。Reddit 社区对营销极度敏感，硬广会被 downvote、删帖、ban。what\_not\_to\_do 不是锦上添花，是产品的核心价值 —— 防止用户好心办坏事。

**content\_opportunity 的延伸逻辑**：Reddit 帖子不仅是回复机会，也是 SEO 选题灵感。从 "被动回复单个帖子" 延伸到 "主动创造内容捕获同类流量"，这是从工具到增长平台的路径。

#### ⑥ 状态追踪（闭环层）



```
New → Reviewing → Replied

&#x20;             ↘ Skipped

&#x20;             ↘ Watch
```



* **New**：新发现，还没看

* **Reviewing**：正在评估，可能要回

* **Replied**：已回复，后续可追踪效果

* **Skipped**：不回，系统可以学习（为什么跳过？评分不准？后续优化模型）

* **Watch**：先放着，定期重新扫描看有没有新变化

**业务逻辑**：状态流转不是简单的标签，是在建立**用户反馈闭环**。用户跳过的帖子 = 评分模型的负样本；用户回复的帖子 = 正样本。积累足够数据后，可以优化评分模型，甚至预测 "哪些帖子用户大概率会回"。

### 2.4 差异化定位



| 竞品                  | 核心逻辑                    | ThreadScout 的差异                 |
| ------------------- | ----------------------- | ------------------------------- |
| GummySearch         | 搜索 + 过滤 Reddit 帖子，偏数据工具 | 不只是找帖子，而是**评估值不值得回 + 教你怎么回**    |
| Syften              | 关键词监控 + 通知，偏 alert 工具   | 不只是通知，而是**优先级排序 + 行动建议**，减少信息过载 |
| 通用搜索（Google/Reddit） | 关键词匹配                   | **购买意图识别**，区分 "闲聊" 和 "正在做购买决策"  |

**一句话差异化**：竞品给你 "相关的帖子列表"，ThreadScout 给你 "今天该回哪 5 个帖子、怎么回、别踩什么坑"。



***

## 3. 技术架构

### 3.1 架构总览



```
┌─────────────────────────────────────────────────────┐

│  前端 (React + Vite)                                 │

│  项目列表 · 扫描触发 · 机会列表 · 详情 · 导出        │

└──────────────────────┬──────────────────────────────┘

&#x20;                      │ HTTP/REST (JSON)

┌──────────────────────▼──────────────────────────────┐

│  API 层 (FastAPI)                                    │

│  路由 · 请求校验 · 认证 · 响应序列化                   │

├─────────────────────────────────────────────────────┤

│  业务逻辑层                                           │

│  项目服务 · 扫描编排器 · 评分引擎 · 导出生成器         │

├──────────────────────┬──────────────────────────────┤

│  数据层 (PostgreSQL) │  异步任务层 (Celery + Redis) │

│  projects · scans    │  扫描 worker · 重试 · 进度    │

│  opportunities ·     │                              │

│  score\_breakdowns    │                              │

├──────────────────────┴──────────────────────────────┤

│  外部服务                                             │

│  Reddit API (PRAW) · DeepSeek LLM API               │

└─────────────────────────────────────────────────────┘
```

### 3.2 技术选型



| 层         | 技术                      | 选型理由                                                      |
| --------- | ----------------------- | --------------------------------------------------------- |
| 后端框架      | Python + FastAPI        | AI 评分是核心，Python LLM 生态成熟；FastAPI 轻量、自动生成 OpenAPI 文档、异步支持好 |
| 数据库       | PostgreSQL 16+          | 关系型数据适合项目 - 扫描 - 机会结构；JSONB 字段存 LLM 原始输出和评分明细             |
| 任务队列      | Celery + Redis          | 扫描是长任务（几分钟），必须异步；Celery 生态成熟，支持重试、进度、定时任务                 |
| ORM       | SQLAlchemy 2.0          | FastAPI 生态标配，异步支持，类型安全                                    |
| 数据迁移      | Alembic                 | SQLAlchemy 官方迁移工具                                         |
| Reddit 接入 | PRAW                    | 官方推荐 Python 封装，自动处理 OAuth、速率限制、分页、重试                      |
| LLM 接入    | OpenAI SDK（DeepSeek 兼容） | DeepSeek API 兼容 OpenAI 接口，用官方 SDK 即可                      |
| 认证        | API Key（MVP）            | MVP 单用户，简单 API key 认证；后续加 JWT + 多用户                       |
| 部署        | Docker + Docker Compose | 本地开发和部署一致，包含 app /db/redis /worker                        |

### 3.3 目录结构



```
threadscout-api/

├── app/

│   ├── main.py              # FastAPI 入口

│   ├── config.py            # 配置管理（环境变量）

│   ├── database.py          # 数据库连接

│   ├── models/              # SQLAlchemy 模型

│   │   ├── project.py

│   │   ├── scan.py

│   │   └── opportunity.py

│   ├── schemas/             # Pydantic 请求/响应模型

│   ├── api/                 # 路由

│   │   ├── projects.py

│   │   ├── scans.py

│   │   └── opportunities.py

│   ├── services/            # 业务逻辑

│   │   ├── project\_service.py

│   │   ├── scan\_service.py

│   │   ├── scoring\_service.py

│   │   └── export\_service.py

│   ├── workers/             # Celery 任务

│   │   ├── celery\_app.py

│   │   └── scan\_tasks.py

│   ├── integrations/        # 外部服务封装

│   │   ├── reddit\_client.py

│   │   └── llm\_client.py

│   └── prompts/             # LLM Prompt 模板

│       └── scoring\_prompt.py

├── migrations/               # Alembic 迁移

├── tests/

├── .env.example

├── docker-compose.yml

├── Dockerfile

├── requirements.txt

└── README.md
```



***

## 4. 数据模型

### 4.1 ER 关系



```
projects (1) ──── (N) scans

&#x20;   │

&#x20;   └──────── (N) opportunities

&#x20;                    │

&#x20;                    └──── (N) score\_breakdowns（5条/机会）
```

### 4.2 表结构

#### projects



| 字段                  | 类型           | 说明                    |
| ------------------- | ------------ | --------------------- |
| id                  | UUID PK      | 项目 ID                 |
| name                | VARCHAR(100) | 项目名称                  |
| url                 | VARCHAR(500) | 产品网址                  |
| description         | TEXT         | 产品描述                  |
| keywords            | JSONB        | 关键词数组                 |
| competitors         | JSONB        | 竞品数组                  |
| include\_subreddits | JSONB        | 包含的 subreddit（空 = 全部） |
| exclude\_subreddits | JSONB        | 排除的 subreddit         |
| created\_at         | TIMESTAMP    | 创建时间                  |
| updated\_at         | TIMESTAMP    | 更新时间                  |

#### scans



| 字段                    | 类型                 | 说明                                     |
| --------------------- | ------------------ | -------------------------------------- |
| id                    | UUID PK            | 扫描 ID                                  |
| project\_id           | UUID FK → projects | 所属项目                                   |
| status                | VARCHAR(20)        | pending / running / completed / failed |
| queries\_generated    | INT                | 生成的检索 query 数                          |
| candidates\_fetched   | INT                | 从 Reddit 拉取的候选帖数                       |
| duplicates\_removed   | INT                | 去重移除数                                  |
| opportunities\_scored | INT                | 完成 LLM 评分的机会数                          |
| error\_message        | TEXT               | 失败时的错误信息                               |
| started\_at           | TIMESTAMP          | 开始时间                                   |
| completed\_at         | TIMESTAMP          | 完成时间                                   |
| created\_at           | TIMESTAMP          | 创建时间                                   |

#### opportunities



| 字段                   | 类型                 | 说明                                          |
| -------------------- | ------------------ | ------------------------------------------- |
| id                   | UUID PK            | 机会 ID                                       |
| scan\_id             | UUID FK → scans    | 所属扫描                                        |
| project\_id          | UUID FK → projects | 所属项目（冗余，方便查询）                               |
| reddit\_post\_id     | VARCHAR(50) UNIQUE | Reddit 帖子 ID（去重用）                           |
| title                | VARCHAR(500)       | 帖子标题                                        |
| url                  | VARCHAR(1000)      | 帖子链接                                        |
| subreddit            | VARCHAR(100)       | 所在 subreddit                                |
| author               | VARCHAR(100)       | 作者                                          |
| selftext             | TEXT               | 帖子正文                                        |
| num\_comments        | INT                | 评论数                                         |
| upvote\_ratio        | FLOAT              | 点赞率                                         |
| posted\_at           | TIMESTAMP          | 发帖时间                                        |
| score                | INT                | 总分（0-100）                                   |
| priority             | VARCHAR(10)        | high / medium / watch                       |
| intent\_type         | VARCHAR(30)        | 意图类型                                        |
| risk\_level          | VARCHAR(10)        | low / medium / high                         |
| status               | VARCHAR(15)        | new / reviewing / replied / skipped / watch |
| summary              | TEXT               | 一句话摘要                                       |
| suggested\_angle     | TEXT               | 建议回复角度                                      |
| what\_not\_to\_do    | TEXT               | 风险提示                                        |
| content\_opportunity | TEXT               | 内容机会（SEO 选题）                                |
| llm\_raw\_output     | JSONB              | LLM 原始 JSON 输出（调试用）                         |
| created\_at          | TIMESTAMP          | 创建时间                                        |
| updated\_at          | TIMESTAMP          | 更新时间                                        |

#### opportunity\_score\_breakdowns



| 字段              | 类型                      | 说明    |
| --------------- | ----------------------- | ----- |
| id              | UUID PK                 | 明细 ID |
| opportunity\_id | UUID FK → opportunities | 所属机会  |
| dimension       | VARCHAR(30)             | 评分维度  |
| score           | INT                     | 该维度得分 |
| max\_score      | INT                     | 该维度满分 |
| note            | TEXT                    | 评分说明  |
| created\_at     | TIMESTAMP               | 创建时间  |

### 4.3 索引



* `opportunities(project_id, status, score DESC)` — 列表查询主索引

* `opportunities(reddit_post_id)` UNIQUE — 去重

* `opportunities(project_id, priority)` — 按优先级筛选

* `scans(project_id, created_at DESC)` — 扫描历史

* `opportunity_score_breakdowns(opportunity_id)` — 评分明细查询



***

## 5. API 设计

### 5.1 通用约定



* Base URL: `/api/v1`

* 认证：Header `X-API-Key: <key>`（MVP）

* 分页：`?page=1&page_size=20`，响应含 `total` / `page` / `page_size`

* 时间格式：ISO 8601

### 5.2 接口列表

#### 项目管理



| 方法     | 路径               | 说明     |
| ------ | ---------------- | ------ |
| GET    | `/projects`      | 项目列表   |
| POST   | `/projects`      | 创建项目   |
| GET    | `/projects/{id}` | 项目详情   |
| PATCH  | `/projects/{id}` | 更新项目设置 |
| DELETE | `/projects/{id}` | 删除项目   |

**POST /projects 请求体：**



```
{

&#x20; "name": "PostPilot",

&#x20; "url": "https://postpilot.io",

&#x20; "description": "AI tool for finding high-intent Reddit discussions",

&#x20; "keywords": \["reddit marketing", "ai seo", "community growth"],

&#x20; "competitors": \["GummySearch", "Syften"],

&#x20; "include\_subreddits": \[],

&#x20; "exclude\_subreddits": \["funny", "pics", "memes"]

}
```

#### 扫描



| 方法   | 路径                     | 说明        |
| ---- | ---------------------- | --------- |
| POST | `/projects/{id}/scan`  | 触发扫描（异步）  |
| GET  | `/scans/{id}`          | 查询扫描状态和进度 |
| GET  | `/projects/{id}/scans` | 项目扫描历史    |

**GET /scans/{id} 响应：**



```
{

&#x20; "id": "uuid",

&#x20; "project\_id": "uuid",

&#x20; "status": "running",

&#x20; "progress": {

&#x20;   "queries\_generated": 24,

&#x20;   "candidates\_fetched": 180,

&#x20;   "duplicates\_removed": 45,

&#x20;   "opportunities\_scored": 12,

&#x20;   "total\_to\_score": 135

&#x20; },

&#x20; "started\_at": "2026-09-03T12:00:00Z",

&#x20; "completed\_at": null

}
```

#### 机会



| 方法    | 路径                             | 说明                 |
| ----- | ------------------------------ | ------------------ |
| GET   | `/projects/{id}/opportunities` | 机会列表（分页 + 筛选 + 排序） |
| GET   | `/opportunities/{id}`          | 机会详情（含评分明细）        |
| PATCH | `/opportunities/{id}`          | 更新机会状态             |

**GET /projects/{id}/opportunities 查询参数：**



| 参数           | 类型     | 说明                                          |
| ------------ | ------ | ------------------------------------------- |
| page         | int    | 页码，默认 1                                     |
| page\_size   | int    | 每页数量，默认 20，最大 100                           |
| status       | string | new / reviewing / replied / skipped / watch |
| priority     | string | high / medium / watch                       |
| intent\_type | string | 意图类型筛选                                      |
| sort         | string | score /posted\_at/created\_at，默认 score      |
| order        | string | asc /desc，默认 desc                           |
| search       | string | 标题关键词搜索                                     |

**PATCH /opportunities/{id} 请求体：**



```
{

&#x20; "status": "reviewing"

}
```

#### 导出



| 方法   | 路径                      | 说明   |
| ---- | ----------------------- | ---- |
| POST | `/projects/{id}/export` | 导出报告 |

**请求体：**



```
{

&#x20; "format": "markdown",

&#x20; "range": "high",

&#x20; "status\_filter": \["new", "reviewing"]

}
```



***

## 6. Reddit API 接入

### 6.1 认证方式

使用 **script 类型应用 + 密码认证**（PRAW 自动处理）：



```
import praw

from app.config import settings

reddit = praw.Reddit(

&#x20;   client\_id=settings.REDDIT\_CLIENT\_ID,

&#x20;   client\_secret=settings.REDDIT\_CLIENT\_SECRET,

&#x20;   user\_agent=settings.REDDIT\_USER\_AGENT,

&#x20;   username=settings.REDDIT\_USERNAME,

&#x20;   password=settings.REDDIT\_PASSWORD,

&#x20;   ratelimit\_seconds=60,

)
```

### 6.2 检索 Query 生成

根据项目关键词，生成多维度检索 query：



```
基础组合：

&#x20; "{keyword}"

&#x20; "{keyword} alternative"

&#x20; "{keyword} vs"

&#x20; "best {keyword}"

&#x20; "{keyword} review"

&#x20; "{keyword} recommendation"

&#x20; "what do you use for {keyword}"

意图扩展：

&#x20; "looking for {keyword}"

&#x20; "any {keyword} tool"

&#x20; "switching from {competitor}"

&#x20; "{competitor} alternative"
```

每个项目生成约 20-30 个 query。

### 6.3 拉取方式



* 对每个 query 执行 `reddit.subreddit("all").search(query, sort="relevance", time_filter="month", limit=100)`

* 补充拉取：对高价值 subreddit 用 `/new` 拉取最近帖子

* 去重：主键 `reddit_post_id`

### 6.4 速率限制处理



| 措施        | 说明                                  |
| --------- | ----------------------------------- |
| PRAW 内置节流 | `ratelimit_seconds=60`，触发 429 时自动等待 |
| 请求间隔      | 每次请求间隔至少 1 秒                        |
| 结果缓存      | 同一帖子不重复拉取                           |
| 并发控制      | 单线程顺序请求，不并发                         |
| 错误重试      | 网络错误 / 5xx 重试 3 次，指数退避              |

### 6.5 预估调用量

单次扫描约 25-40 次 API 调用（20-30 次搜索 + 5-10 次 subreddit 补充拉取），远低于 60 次 / 分钟限制。



***

## 7. LLM 评分引擎

### 7.1 模型配置



| 配置项         | 值                                                                     |
| ----------- | --------------------------------------------------------------------- |
| 模型          | deepseek-v4-flash                                                     |
| API 端点      | [https://api.deepseek.com/v1](https://api.deepseek.com/v1)（OpenAI 兼容） |
| temperature | 0.3（低温度保证评分一致性）                                                       |
| 输出格式        | JSON Object                                                           |
| 最大 token    | 2000                                                                  |

### 7.2 评分维度



| 维度                 | 满分      | 说明           |
| ------------------ | ------- | ------------ |
| buying\_intent     | 30      | 购买 / 选型意图强度  |
| product\_fit       | 20      | 与产品的匹配度      |
| search\_visibility | 20      | 标题的 SEO 长尾价值 |
| timing             | 15      | 回复时机（新鲜度）    |
| reply\_feasibility | 15      | 安全回复的可行性     |
| **总分**             | **100** |              |

### 7.3 优先级与风险判定



* **high**：总分 ≥ 80 且 buying\_intent ≥ 20

* **medium**：总分 60-79

* **watch**：总分 < 60

* **risk\_level=high**：帖子明确禁止推广 / 社区对营销敏感 /reply\_feasibility < 8

* **risk\_level=medium**：需谨慎措辞，不能直接推产品

* **risk\_level=low**：可以自然提及产品（需披露关联）

### 7.4 输出 Schema



```
{

&#x20; "intent\_type": "recommendation",

&#x20; "scores": {

&#x20;   "buying\_intent": {"score": 29, "max": 30, "note": "..."},

&#x20;   "product\_fit": {"score": 19, "max": 20, "note": "..."},

&#x20;   "search\_visibility": {"score": 18, "max": 20, "note": "..."},

&#x20;   "timing": {"score": 12, "max": 15, "note": "..."},

&#x20;   "reply\_feasibility": {"score": 14, "max": 15, "note": "..."}

&#x20; },

&#x20; "total\_score": 92,

&#x20; "priority": "high",

&#x20; "risk\_level": "low",

&#x20; "summary": "一句话摘要",

&#x20; "suggested\_angle": "建议回复角度",

&#x20; "what\_not\_to\_do": "风险提示",

&#x20; "content\_opportunity": "SEO 内容机会"

}
```

### 7.5 Prompt 设计要点



* System prompt 包含完整评分标准和判定规则

* 输入包含产品信息 + 帖子信息（标题、正文、subreddit、评论数、发帖时间、前 3 条评论摘要）

* 强制 JSON 输出，不允许额外文字

* 评分说明（note）要求具体，不允许空泛描述

* few-shot 示例（2-3 个典型帖子的评分示例）保证一致性

### 7.6 成本估算



| 项目          | 估算                  |
| ----------- | ------------------- |
| 单次评分输入      | \~800 token         |
| 单次评分输出      | \~400 token         |
| 单次扫描评分次数    | 30-50 次（粗筛后）        |
| 每天 10 次扫描   | \~30-60 万 token / 天 |
| Flash 模型月成本 | 几十元人民币级别            |



***

## 8. 扫描工作流

### 8.1 完整流程



```
用户点击 "Run scan"

&#x20;       │

&#x20;       ▼

┌─────────────────────────┐

│  1. 创建 scan 记录       │  status=pending

│  生成检索 query 列表     │  20-30 个 query

└───────────┬─────────────┘

&#x20;           │

&#x20;           ▼

┌─────────────────────────┐

│  2. 粗筛（规则，无 LLM） │

│  Reddit API 拉取候选帖子  │  25-40 次 API 调用

│  关键词匹配标题/正文       │  过滤明显不相关

│  排除低意图 subreddit     │

│  去重（reddit\_post\_id）   │

│  → 从几百条缩到 30-50 条  │

└───────────┬─────────────┘

&#x20;           │

&#x20;           ▼

┌─────────────────────────┐

│  3. 精评（LLM）          │

│  逐条送 DeepSeek 评分     │  30-50 次 LLM 调用

│  解析 JSON 输出           │

│  写入 opportunities 表    │

│  写入 score\_breakdowns   │

│  更新 scan 进度           │

└───────────┬─────────────┘

&#x20;           │

&#x20;           ▼

┌─────────────────────────┐

│  4. 完成                 │

│  scan.status=completed   │

│  记录统计数据             │

│  前端轮询到完成状态        │

└─────────────────────────┘
```

### 8.2 异步处理



* Celery 异步执行扫描任务

* 前端通过 `GET /scans/{id}` 轮询进度（2-3 秒一次）

* 扫描过程中已评分的机会**立即可查**（不需要等全部完成）

* 支持取消扫描（Celery revoke）

### 8.3 粗筛规则

全部满足才通过：



1. 标题或正文包含至少一个项目关键词或同义词

2. subreddit 不在 exclude\_subreddits 列表

3. 不是 meme / 图片 / 视频帖（selftext 非空或标题含疑问词）

4. 发帖时间在配置范围内（默认最近 3 个月）

5. 不是已处理过的帖子（reddit\_post\_id 去重）

### 8.4 错误处理



| 错误类型           | 处理方式                                     |
| -------------- | ---------------------------------------- |
| Reddit API 429 | PRAW 自动等待，最多 60 秒                        |
| Reddit API 5xx | 重试 3 次，指数退避                              |
| LLM API 超时     | 重试 2 次，超时 30 秒                           |
| LLM JSON 解析失败  | 重试 1 次，仍失败则跳过并记录                         |
| 单条帖子处理失败       | 记录错误，继续下一条，不中断扫描                         |
| 扫描整体失败         | status=failed，记录 error\_message，已处理的机会保留 |



***

## 9. MVP 范围

### 9.1 必须做（MVP）



* [ ] 项目 CRUD

* [ ] 手动触发扫描 + 异步进度查询

* [ ] Reddit API 数据拉取 + 粗筛

* [ ] LLM 五维评分 + 建议生成

* [ ] 机会列表（分页、筛选、排序、搜索）

* [ ] 机会详情（含评分明细）

* [ ] 机会状态更新

* [ ] 导出 Markdown / CSV

* [ ] API Key 认证（单用户）

* [ ] Docker Compose 一键启动

### 9.2 后续迭代（P1+）



* [ ] 定时扫描（weekly alerts，邮件通知）

* [ ] 多用户 / 团队协作（JWT 认证 + 角色权限）

* [ ] 评分模型调优（用户反馈闭环）

* [ ] AI 引用监控

* [ ] 竞品帖子对比分析

* [ ] subreddit 级统计仪表盘

* [ ] 批量操作

* [ ] 键盘快捷键

* [ ] 自定义列显示

* [ ] 保存筛选视图

* [ ] 回复草稿生成

* [ ] 应用内 Reddit 帖子预览



***

## 10. 风险与应对

### 10.1 技术风险



| 风险              | 概率 | 影响   | 应对                                   |
| --------------- | -- | ---- | ------------------------------------ |
| Reddit API 速率限制 | 中  | 扫描变慢 | PRAW 内置节流 + 请求间隔 + 缓存                |
| Reddit 搜索结果不全   | 高  | 遗漏机会 | 多 query 覆盖 + subreddit /new 补充       |
| LLM 评分不一致       | 中  | 排序不准 | 低 temperature + 固定 prompt + few-shot |
| LLM JSON 解析失败   | 低  | 单条丢失 | 重试 + 失败记录 + 不中断扫描                    |
| 扫描时间过长          | 低  | 体验差  | 异步 + 进度轮询 + 已评分立即可查                  |

### 10.2 合规风险



| 风险              | 概率 | 影响    | 应对                                    |
| --------------- | -- | ----- | ------------------------------------- |
| Reddit API 条款变更 | 低  | 可能需付费 | 抽象数据层，可切换第三方数据源                       |
| 数据存储合规          | 低  | 法律风险  | 只存公开帖子数据，不存用户个人信息                     |
| 产品被用于垃圾营销       | 中  | 品牌风险  | risk\_level 提示 + what\_not\_to\_do 警告 |

### 10.3 成本风险



| 风险            | 概率 | 影响    | 应对                      |
| ------------- | -- | ----- | ----------------------- |
| LLM 成本超预期     | 低  | 运营成本  | 粗筛减少调用量 + Flash 模型 + 缓存 |
| Reddit API 收费 | 低  | 可能需付费 | MVP 免费档够用，后续评估          |



***

## 11. 开发计划

### 11.1 里程碑



| 阶段           | 内容                         | 预估工时         |
| ------------ | -------------------------- | ------------ |
| M1：基础设施      | 项目搭建、数据库、Docker、配置管理       | 1 天          |
| M2：项目管理 API  | projects CRUD + 认证         | 1 天          |
| M3：Reddit 接入 | PRAW 封装 + 搜索 + 粗筛 + 去重     | 2 天          |
| M4：LLM 评分    | Prompt 设计 + 评分服务 + 解析 + 入库 | 2 天          |
| M5：扫描编排      | Celery 异步任务 + 进度追踪 + 错误处理  | 1 天          |
| M6：机会 API    | 列表 / 详情 / 状态更新 + 筛选排序分页    | 1 天          |
| M7：导出        | Markdown / CSV 导出生成        | 0.5 天        |
| M8：联调测试      | 前后端联调 + 端到端测试 + Bug 修复     | 2 天          |
| **合计**       |                            | **约 10.5 天** |

### 11.2 前置依赖



* [ ] Reddit 开发者应用创建完成（获取 client\_id /client\_secret）

* [ ] DeepSeek API key 确认可用（已获取）

* [ ] 前端 API 对接方案确认



***

## 12. 环境变量



```
\# 应用

APP\_NAME=threadscout-api

APP\_ENV=development

API\_KEY=your-api-key-here

\# 数据库

DATABASE\_URL=postgresql+asyncpg://threadscout:threadscout@db:5432/threadscout

\# Redis

REDIS\_URL=redis://redis:6379/0

\# Reddit API

REDDIT\_CLIENT\_ID=your-client-id

REDDIT\_CLIENT\_SECRET=your-client-secret

REDDIT\_USER\_AGENT=threadscout:v0.1 by /u/your-username

REDDIT\_USERNAME=your-reddit-username

REDDIT\_PASSWORD=your-reddit-password

\# DeepSeek LLM

DEEPSEEK\_API\_KEY=sk-your-deepseek-key

DEEPSEEK\_BASE\_URL=https://api.deepseek.com/v1

DEEPSEEK\_MODEL=deepseek-v4-flash

LLM\_TEMPERATURE=0.3

LLM\_MAX\_TOKENS=2000

\# 扫描配置

SCAN\_DEFAULT\_TIME\_FILTER=month

SCAN\_MAX\_QUERIES=30

SCAN\_MAX\_CANDIDATES=100
```



***

## 附录 A：前端对接说明

当前前端（`threadscout-app`）使用本地 demo 数据。后端上线后需要：



1. 添加 API client 层（`src/api/`），封装 fetch/axios 调用

2. 将 demo 数据替换为真实 API 调用

3. 扫描触发后增加进度轮询逻辑

4. 导出改为调用后端 API 下载文件

5. 配置 API base URL 和 API key（环境变量）

前端改动预估 1-2 天，可在后端 M6 完成后并行进行。



***

*文档结束。审核后请反馈修改意见，确认后进入开发阶段。*