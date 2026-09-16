# ThreadScout 项目文档

> ThreadScout — Reddit 高意向帖子发现工具  
> 版本：v0.1 MVP  
> 更新日期：2026-09-04

---

## 项目简介

ThreadScout 帮助 SaaS 创始人和营销人员自动发现 Reddit 上的高购买意图讨论，通过 AI 五维评分排序，告诉你哪些帖子值得回复、怎么回复、要注意什么。

**技术栈：**
- 前端：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 后端：FastAPI + PostgreSQL + Celery + Redis
- AI：DeepSeek LLM（五维评分引擎）
- 数据源：Reddit 公开 API（匿名 .json 模式）

---

## 文档清单

| 文档 | 说明 | 读者 |
|---|---|---|
| [用户手册](./user-guide.md) | 产品功能说明、操作指南、使用技巧 | 最终用户 |
| [前后端对接文档](./api-integration.md) | API 接口说明、数据模型、前端对接方式 | 前端/后端开发 |
| [部署文档](./deployment.md) | 环境要求、安装步骤、配置说明、生产部署 | 运维/开发 |
| [测试文档](./testing-guide.md) | 测试用例、测试框架、性能/安全测试 | 测试/开发 |
| [后端技术方案](./backend-architecture.md) | 架构设计、业务逻辑、评分算法、技术选型 | 架构师/后端开发 |

---

## 快速开始

### 本地开发（5 分钟启动）

```bash
# 1. 启动 PostgreSQL 和 Redis
# （本地已安装则跳过，或用 Docker）
docker run -d --name ts-db -e POSTGRES_USER=threadscout -e POSTGRES_PASSWORD=threadscout -e POSTGRES_DB=threadscout -p 5432:5432 postgres:16-alpine
docker run -d --name ts-redis -p 6379:6379 redis:7-alpine

# 2. 配置后端
cd threadscout-api
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 3. 安装依赖并执行迁移
pip install -r requirements.txt
alembic upgrade head

# 4. 启动后端（终端 1）
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 5. 启动 Celery Worker（终端 2）
celery -A app.workers.celery_app.celery worker --loglevel=info --pool=solo

# 6. 启动前端（终端 3）
cd ../threadscout-app
npm install
npm run dev
```

### 访问地址

| 服务 | 地址 |
|---|---|
| 前端应用 | http://127.0.0.1:5173/ |
| 后端 API | http://127.0.0.1:8000 |
| API 文档（Swagger） | http://127.0.0.1:8000/docs |
| 健康检查 | http://127.0.0.1:8000/health |

### Docker 一键启动

```bash
cd threadscout-api
cp .env.example .env  # 填入 DEEPSEEK_API_KEY
docker-compose up -d
docker-compose exec api alembic upgrade head
```

---

## 核心功能

1. **项目管理** — 创建/编辑/删除项目，配置关键词、竞品、包含/排除社区
2. **智能扫描** — 自动生成搜索 query，拉取 Reddit 帖子，规则粗筛，LLM 精评
3. **五维评分** — 购买意图(30%) + 产品匹配(20%) + 搜索可见(20%) + 时效性(15%) + 回复可行性(15%)
4. **意图识别** — 7 种意图分类（recommendation/alternative/comparison/pain_point 等）
5. **机会列表** — 按分数排序，快捷筛选，状态管理
6. **详情分析** — AI 建议回复角度、注意事项、内容机会、五维评分明细
7. **报告导出** — Markdown / CSV 格式导出

---

## 项目结构

```
threadscout/
├── threadscout-api/          # 后端服务
│   ├── app/
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 配置
│   │   ├── models/           # 数据模型
│   │   ├── schemas/          # Pydantic 模型
│   │   ├── api/v1/           # API 路由
│   │   ├── services/         # 业务服务层
│   │   ├── workers/          # Celery 异步任务
│   │   ├── integrations/     # Reddit / LLM 集成
│   │   └── prompts/          # LLM Prompt 模板
│   ├── alembic/              # 数据库迁移
│   ├── tests/                # 测试
│   ├── docker-compose.yml
│   └── requirements.txt
│
└── threadscout-app/          # 前端应用
    ├── src/
    │   ├── App.tsx           # 主应用（单文件）
    │   ├── api/client.ts     # API 客户端
    │   └── components/       # UI 组件
    ├── docs/                 # 项目文档（本目录）
    ├── package.json
    └── vite.config.ts
```

---

## 开发规范

### 分支管理

- `main` — 生产分支
- `develop` — 开发分支
- `feature/*` — 功能分支
- `fix/*` — 修复分支

### 代码规范

- 后端：Python 3.10+，类型注解，ruff 格式化
- 前端：TypeScript 严格模式，oxlint 检查
- 提交信息：Conventional Commits（feat/fix/docs/refactor/test/chore）

### API 设计规范

- RESTful 风格
- 版本化：`/api/v1/`
- 统一错误格式：`{"detail": "错误信息"}`
- 认证：`X-API-Key` 请求头
- 分页：`page` + `page_size`，响应含 `total`

---

## 路线图

### v0.1 MVP（当前）
- ✅ 项目管理
- ✅ Reddit 匿名模式扫描
- ✅ LLM 五维评分
- ✅ 机会列表与详情
- ✅ 状态管理
- ✅ 报告导出
- ✅ 前后端对接

### v0.2（计划）
- 🔲 Reddit OAuth 模式（审批通过后）
- 🔲 批量操作（批量更新状态、批量导出）
- 🔲 键盘快捷键
- 🔲 自定义列显示
- 🔲 保存筛选视图
- 🔲 扫描历史对比

### v1.0（未来）
- 🔲 多用户/团队协作
- 🔲 定时自动扫描
- 🔲 邮件通知
- 🔲 回复模板管理
- 🔲 数据看板与趋势分析
- 🔲 移动端适配

---

## 常见问题

### Q: Reddit API 注册不了怎么办？

A: Reddit 已关闭自助式 API 注册，改为审批制。当前使用匿名 .json 端点模式，不需要注册。如需更高速率限制，提交工单申请：[申请流程](https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164&tf_14867328473236=api_request_type_enterprise)

### Q: 扫描很慢怎么办？

A: 匿名模式速率限制约 10 次/分钟，100 个候选帖子约需 5-10 分钟。可通过以下方式优化：
- 减少关键词数量（默认最多 30 个 query）
- 增大 `SCAN_REQUEST_INTERVAL` 避免触发限流
- 审批通过后切换 OAuth 模式（60 次/分钟）

### Q: LLM 评分不准确怎么办？

A: AI 评分是辅助参考。建议：
- 重点关注 High priority（80 分以上），通常较准
- 调整关键词后重新扫描
- 查看五维评分明细，理解评分理由
- 未来版本支持自定义评分权重

### Q: 数据会上传到第三方吗？

A: 不会。所有数据存储在你自己的数据库中。Reddit 帖子内容仅发送给 DeepSeek API 进行评分，不存储用户个人数据。

---

## 联系方式

- 项目文档：`docs/` 目录
- API 文档：http://127.0.0.1:8000/docs（本地）
- 问题反馈：提交 Issue

---

*ThreadScout — 找到值得回复的 Reddit 讨论*
