# ThreadScout 测试文档

> 版本：v1.0  
> 更新日期：2026-09-04  
> 适用对象：开发人员、测试人员

---

## 1. 测试环境

### 1.1 环境要求

| 组件 | 版本 |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| PostgreSQL | 14+ |
| Redis | 6.0+ |
| 浏览器 | Chrome 100+ / Firefox 100+ / Edge 100+ |

### 1.2 测试环境搭建

```bash
# 1. 启动数据库和 Redis
docker run -d --name test-db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=threadscout_test -p 5433:5432 postgres:16-alpine
docker run -d --name test-redis -p 6380:6379 redis:7-alpine

# 2. 配置测试环境变量
cd threadscout-api
cat > .env.test << 'EOF'
APP_ENV=testing
DATABASE_URL=postgresql+asyncpg://test:test@localhost:5433/threadscout_test
REDIS_URL=redis://localhost:6380/0
DEEPSEEK_API_KEY=sk-test-key
REDDIT_AUTH_MODE=anonymous
EOF

# 3. 执行迁移
set -a && source .env.test && set +a
alembic upgrade head
```

---

## 2. 后端测试

### 2.1 测试框架

- **单元测试**：pytest + pytest-asyncio
- **API 测试**：pytest + httpx（AsyncClient）
- **测试数据库**：使用独立的测试数据库，测试前后自动清理

### 2.2 测试目录结构

```
threadscout-api/
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # pytest 配置和 fixtures
│   ├── unit/
│   │   ├── test_models.py       # 数据模型测试
│   │   ├── test_schemas.py      # Pydantic schema 测试
│   │   ├── test_reddit_client.py # Reddit 客户端测试
│   │   └── test_llm_client.py   # LLM 客户端测试
│   ├── integration/
│   │   ├── test_project_service.py
│   │   ├── test_scan_service.py
│   │   └── test_opportunity_service.py
│   └── api/
│       ├── test_projects_api.py
│       ├── test_scans_api.py
│       └── test_opportunities_api.py
```

### 2.3 conftest.py 配置示例

```python
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import async_session, Base
from app.config import settings
from sqlalchemy.ext.asyncio import create_async_engine

# 测试数据库引擎
test_engine = create_async_engine(settings.DATABASE_URL, echo=False)

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(autouse=True)
async def clean_db():
    """每个测试前清理数据库"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield

@pytest.fixture
async def client():
    """API 测试客户端"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def db_session():
    """数据库会话"""
    async with async_session() as session:
        yield session
```

### 2.4 运行测试

```bash
cd threadscout-api

# 运行所有测试
pytest tests/ -v

# 运行单元测试
pytest tests/unit/ -v

# 运行 API 测试
pytest tests/api/ -v

# 生成覆盖率报告
pytest tests/ --cov=app --cov-report=html --cov-report=term

# 运行特定测试文件
pytest tests/api/test_projects_api.py -v

# 运行特定测试用例
pytest tests/api/test_projects_api.py::test_create_project -v
```

---

## 3. API 测试用例

### 3.1 项目管理接口

| 用例 ID | 用例名称 | 方法 | 端点 | 预期结果 |
|---|---|---|---|---|
| API-P001 | 获取空项目列表 | GET | /projects | 返回 200，空数组 |
| API-P002 | 创建项目 | POST | /projects | 返回 201，项目信息正确 |
| API-P003 | 创建项目缺少 name | POST | /projects | 返回 422，校验错误 |
| API-P004 | 获取项目详情 | GET | /projects/{id} | 返回 200，项目信息 |
| API-P005 | 获取不存在的项目 | GET | /projects/invalid-id | 返回 404 |
| API-P006 | 更新项目 | PATCH | /projects/{id} | 返回 200，更新后信息 |
| API-P007 | 删除项目 | DELETE | /projects/{id} | 返回 204 |
| API-P008 | 删除后获取项目 | GET | /projects/{id} | 返回 404 |
| API-P009 | 项目列表含统计 | GET | /projects | 返回 total_opportunities、high_priority_count |
| API-P010 | 未认证访问 | GET | /projects | 返回 401（生产环境） |

### 3.2 扫描接口

| 用例 ID | 用例名称 | 方法 | 端点 | 预期结果 |
|---|---|---|---|---|
| API-S001 | 触发扫描 | POST | /projects/{id}/scan | 返回 202，scan_id |
| API-S002 | 触发不存在项目的扫描 | POST | /projects/invalid/scan | 返回 404 |
| API-S003 | 获取扫描进度 | GET | /scans/{id} | 返回 200，扫描信息 |
| API-S004 | 获取不存在的扫描 | GET | /scans/invalid | 返回 404 |
| API-S005 | 扫描历史列表 | GET | /projects/{id}/scans | 返回 200，扫描数组 |
| API-S006 | 扫描状态枚举正确 | GET | /scans/{id} | status 为 pending/running/completed/failed |
| API-S007 | 扫描进度字段完整 | GET | /scans/{id} | 含 progress 对象，6 个字段 |

### 3.3 机会接口

| 用例 ID | 用例名称 | 方法 | 端点 | 预期结果 |
|---|---|---|---|---|
| API-O001 | 获取机会列表 | GET | /projects/{id}/opportunities | 返回 200，含 items/total/page |
| API-O002 | 分页参数 | GET | /projects/{id}/opportunities?page=1&page_size=10 | 返回正确分页 |
| API-O003 | 状态筛选 | GET | /projects/{id}/opportunities?status=new | 仅返回 new 状态 |
| API-O004 | 优先级筛选 | GET | /projects/{id}/opportunities?priority=high | 仅返回 high 优先级 |
| API-O005 | 意图类型筛选 | GET | /projects/{id}/opportunities?intent_type=recommendation | 仅返回该意图 |
| API-O006 | 搜索筛选 | GET | /projects/{id}/opportunities?search=keyword | 标题含关键词 |
| API-O007 | 排序 | GET | /projects/{id}/opportunities?sort=score&order=desc | 按分数降序 |
| API-O008 | 获取机会详情 | GET | /opportunities/{id} | 返回 200，完整字段 |
| API-O009 | 详情含评分明细 | GET | /opportunities/{id} | 含 score_breakdowns 数组 |
| API-O010 | 获取不存在的机会 | GET | /opportunities/invalid | 返回 404 |
| API-O011 | 更新状态 | PATCH | /opportunities/{id} | 返回 200，状态已更新 |
| API-O012 | 更新无效状态 | PATCH | /opportunities/{id} | 返回 422，校验错误 |
| API-O013 | 列表不含详情字段 | GET | /projects/{id}/opportunities | items 不含 selftext/breakdowns |

### 3.4 导出接口

| 用例 ID | 用例名称 | 方法 | 端点 | 预期结果 |
|---|---|---|---|---|
| API-E001 | 导出 Markdown | POST | /projects/{id}/export | 返回文件流，Content-Type 正确 |
| API-E002 | 导出 CSV | POST | /projects/{id}/export | 返回 CSV 格式 |
| API-E003 | 导出高优先级 | POST | /projects/{id}/export | range=high 时仅含高优先级 |
| API-E004 | 无效格式 | POST | /projects/{id}/export | 返回 422 |

---

## 4. 服务层测试用例

### 4.1 ProjectService

| 用例 ID | 用例名称 | 预期结果 |
|---|---|---|
| SVC-P001 | 创建项目 | 项目写入数据库，字段正确 |
| SVC-P002 | 创建项目含关键词 | keywords 数组正确存储 |
| SVC-P003 | 项目列表统计 | total_opportunities、high_priority_count 正确 |
| SVC-P004 | 最后扫描状态 | last_scan_status、last_scan_at 正确关联 |
| SVC-P005 | 删除项目级联 | 删除项目后关联的扫描和机会也被删除 |

### 4.2 ScanService

| 用例 ID | 用例名称 | 预期结果 |
|---|---|---|
| SVC-S001 | 创建扫描记录 | scan 写入数据库，status=pending |
| SVC-S002 | 更新扫描进度 | progress 字段正确更新 |
| SVC-S003 | 标记扫描完成 | status=completed，completed_at 有值 |
| SVC-S004 | 标记扫描失败 | status=failed，error_message 有值 |

### 4.3 OpportunityService

| 用例 ID | 用例名称 | 预期结果 |
|---|---|---|
| SVC-O001 | 创建机会 | 机会写入数据库，字段正确 |
| SVC-O002 | 去重 | 相同 reddit_post_id 不重复创建 |
| SVC-O003 | 评分明细 | score_breakdowns 5 条记录正确创建 |
| SVC-O004 | 列表查询 | 分页、筛选、排序正确 |
| SVC-O005 | 详情查询 | 含 score_breakdowns 关联 |
| SVC-O006 | 更新状态 | status 字段正确更新 |

---

## 5. 集成测试

### 5.1 扫描流程集成测试

**测试目标：** 验证从触发扫描到机会入库的完整流程

**测试步骤：**
1. 创建测试项目
2. 触发扫描（mock Reddit 客户端和 LLM 客户端）
3. 等待扫描完成
4. 查询机会列表
5. 验证机会数量和字段正确

**Mock 策略：**
- Reddit 客户端：返回固定的测试帖子数据
- LLM 客户端：返回固定的评分结果

```python
@pytest.mark.asyncio
async def test_full_scan_flow(client, db_session, monkeypatch):
    # Mock Reddit 客户端
    mock_posts = [RedditPost(id="test1", title="Test post", ...)]
    monkeypatch.setattr("app.workers.scan_tasks.get_reddit_client", 
                       lambda: MockRedditClient(mock_posts))
    
    # Mock LLM 客户端
    mock_result = {"total_score": 85, "priority": "high", ...}
    monkeypatch.setattr("app.workers.scan_tasks.llm_client.score_post",
                       lambda *args, **kwargs: mock_result)
    
    # 创建项目
    resp = await client.post("/projects", json={"name": "Test"})
    project_id = resp.json()["id"]
    
    # 触发扫描
    resp = await client.post(f"/projects/{project_id}/scan")
    scan_id = resp.json()["scan_id"]
    
    # 等待完成（Celery eager 模式）
    await asyncio.sleep(1)
    
    # 验证结果
    resp = await client.get(f"/projects/{project_id}/opportunities")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["score"] == 85
```

### 5.2 前后端联调测试

**测试目标：** 验证前端 API 客户端与后端接口的兼容性

**测试内容：**
1. 前端 `api.listProjects()` → 后端 `GET /projects`
2. 前端 `api.createProject()` → 后端 `POST /projects`
3. 前端 `api.triggerScan()` → 后端 `POST /projects/{id}/scan`
4. 前端 `api.getScan()` → 后端 `GET /scans/{id}`
5. 前端 `api.listOpportunities()` → 后端 `GET /projects/{id}/opportunities`
6. 前端 `api.getOpportunity()` → 后端 `GET /opportunities/{id}`
7. 前端 `api.updateOpportunityStatus()` → 后端 `PATCH /opportunities/{id}`
8. 前端 `api.exportOpportunities()` → 后端 `POST /projects/{id}/export`

**验证点：**
- 请求方法和路径正确
- 请求体格式正确
- 响应状态码正确
- 响应数据结构与前端 TypeScript 类型匹配
- 枚举值大小写一致

---

## 6. 前端测试

### 6.1 测试框架

- **单元测试**：Vitest + React Testing Library
- **组件测试**：React Testing Library
- **E2E 测试**：Playwright（可选）

### 6.2 测试目录结构

```
threadscout-app/
├── src/
│   ├── __tests__/
│   │   ├── App.test.tsx
│   │   ├── api.test.ts
│   │   └── components.test.tsx
│   └── ...
├── vitest.config.ts
└── playwright.config.ts
```

### 6.3 前端测试用例

| 用例 ID | 用例名称 | 类型 | 预期结果 |
|---|---|---|---|
| FE-001 | 应用启动不崩溃 | 集成 | 渲染主界面，无报错 |
| FE-002 | 项目列表渲染 | 组件 | 显示项目名称和统计 |
| FE-003 | 加载状态显示 | 组件 | 显示 loading 指示器 |
| FE-004 | 空状态显示 | 组件 | 无项目时显示引导 |
| FE-005 | 切换项目 | 集成 | 机会列表更新，详情关闭 |
| FE-006 | 触发扫描 | 集成 | 跳转到扫描进度页 |
| FE-007 | 扫描进度更新 | 组件 | 进度条和数字正确更新 |
| FE-008 | 机会列表渲染 | 组件 | 表格显示所有列 |
| FE-009 | 快捷筛选 | 组件 | 点击 chip 过滤列表 |
| FE-010 | 状态筛选 | 组件 | 下拉选择过滤列表 |
| FE-011 | 打开详情抽屉 | 组件 | 点击行打开右侧抽屉 |
| FE-012 | 详情加载状态 | 组件 | 显示 loading 后显示内容 |
| FE-013 | 五维评分显示 | 组件 | 5 个维度分数和说明 |
| FE-014 | 更新状态 | 集成 | 状态变更并保存到后端 |
| FE-015 | 导出对话框 | 组件 | 打开对话框，选择格式 |
| FE-016 | API 客户端类型 | 单元 | TypeScript 类型正确 |
| FE-017 | 错误处理 | 集成 | API 失败时显示错误提示 |
| FE-018 | 响应式布局 | 组件 | 不同屏幕尺寸下布局正常 |

### 6.4 运行前端测试

```bash
cd threadscout-app

# 单元测试
npm run test

# 测试覆盖率
npm run test -- --coverage

# E2E 测试（需安装 Playwright）
npx playwright install
npx playwright test
```

---

## 7. 端到端（E2E）测试

### 7.1 测试场景

| 场景 ID | 场景名称 | 步骤 | 预期结果 |
|---|---|---|---|
| E2E-001 | 完整用户流程 | 1. 创建项目 2. 触发扫描 3. 等待完成 4. 查看机会 5. 打开详情 6. 更新状态 7. 导出报告 | 所有步骤成功，数据一致 |
| E2E-002 | 多项目切换 | 1. 创建项目 A 2. 创建项目 B 3. 切换 A 4. 切换 B | 每个项目显示各自数据 |
| E2E-003 | 筛选与排序 | 1. 创建含多条机会的项目 2. 测试各筛选条件 3. 测试排序 | 筛选和排序结果正确 |
| E2E-004 | 错误恢复 | 1. 触发扫描 2. 模拟扫描失败 3. 查看错误信息 4. 重新触发 | 错误正确显示，可重试 |
| E2E-005 | 大数据量 | 1. 创建 100+ 机会的项目 2. 翻页浏览 3. 筛选 4. 导出 | 性能可接受，无崩溃 |

### 7.2 Playwright 配置

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
})
```

---

## 8. 性能测试

### 8.1 后端性能指标

| 指标 | 目标值 | 测试方法 |
|---|---|---|
| API 响应时间（P95） | < 200ms | locust / k6 |
| API 吞吐量 | > 100 req/s | locust / k6 |
| 数据库查询时间 | < 50ms | 慢查询日志 |
| 扫描完成时间（100 候选） | < 10 分钟 | 实际扫描计时 |

### 8.2 前端性能指标

| 指标 | 目标值 | 测试方法 |
|---|---|---|
| 首屏加载时间 | < 2s | Lighthouse |
| 交互响应时间 | < 100ms | 用户体验测试 |
| 列表渲染（100 条） | < 500ms | React DevTools |
| 包体积（gzip） | < 200KB | vite build 输出 |

### 8.3 性能测试工具

```bash
# 后端负载测试（locust）
pip install locust
locust -f tests/performance/locustfile.py --host http://127.0.0.1:8000

# 前端性能分析
npm run build  # 查看包体积
npx lighthouse http://127.0.0.1:5173 --view  # Lighthouse 审计
```

---

## 9. 安全测试

### 9.1 认证与授权

| 测试项 | 预期结果 |
|---|---|
| 无 API Key 访问（生产） | 返回 401 |
| 错误 API Key 访问 | 返回 401 |
| 正确 API Key 访问 | 返回 200 |
| 开发环境无 Key 访问 | 返回 200（放行） |

### 9.2 输入验证

| 测试项 | 预期结果 |
|---|---|
| SQL 注入（项目名含 `' OR 1=1--`） | 返回 422 或正常处理，不执行注入 |
| XSS（项目名含 `<script>`） | 前端转义显示，不执行脚本 |
| 超长字符串（> 字段长度限制） | 返回 422 校验错误 |
| 无效枚举值（status=invalid） | 返回 422 校验错误 |
| 负数页码（page=-1） | 返回 422 或自动修正 |

### 9.3 数据安全

| 测试项 | 预期结果 |
|---|---|
| 不存储用户密码 | 数据库无密码字段 |
| 不存储 Reddit 用户个人数据 | 仅存帖子元数据 |
| API Key 不明文日志 | 日志中不显示 API Key |
| DeepSeek Key 不暴露给前端 | 前端无法获取后端密钥 |
| CORS 配置（生产） | 仅允许指定域名 |

---

## 10. 测试数据

### 10.1 测试项目

```python
TEST_PROJECT = {
    "name": "TestProject",
    "url": "https://test.example.com",
    "description": "Test project for automated testing",
    "keywords": ["test keyword 1", "test keyword 2"],
    "competitors": ["Competitor A", "Competitor B"],
    "include_subreddits": ["testsub1"],
    "exclude_subreddits": ["testsub2"],
}
```

### 10.2 测试机会

```python
TEST_OPPORTUNITY = {
    "reddit_post_id": "test_post_001",
    "title": "Best test tool for automated testing?",
    "url": "https://reddit.com/r/test/comments/001",
    "subreddit": "test",
    "author": "testuser",
    "selftext": "Looking for a tool to automate testing.",
    "num_comments": 42,
    "upvote_ratio": 0.85,
    "score": 88,
    "priority": "high",
    "intent_type": "recommendation",
    "risk_level": "low",
    "status": "new",
}
```

### 10.3 Mock LLM 响应

```python
MOCK_LLM_RESULT = {
    "total_score": 88,
    "priority": "high",
    "intent_type": "recommendation",
    "risk_level": "low",
    "summary": "User is looking for a testing tool.",
    "suggested_angle": "Explain key features to look for.",
    "what_not_to_do": "Don't lead with product link.",
    "content_opportunity": "Best testing tools guide.",
    "scores": {
        "buying_intent": {"score": 28, "max": 30, "note": "Direct recommendation request"},
        "product_fit": {"score": 18, "max": 20, "note": "Matches core use case"},
        "search_visibility": {"score": 17, "max": 20, "note": "Clear long-tail query"},
        "timing": {"score": 13, "max": 15, "note": "Recent and active"},
        "reply_feasibility": {"score": 12, "max": 15, "note": "Helpful reply fits"},
    },
}
```

---

## 11. 测试执行清单

### 11.1 提交前测试（每次代码变更）

- [ ] 后端单元测试通过：`pytest tests/unit/ -v`
- [ ] 后端 API 测试通过：`pytest tests/api/ -v`
- [ ] 前端单元测试通过：`npm run test`
- [ ] 前端构建通过：`npm run build`
- [ ] 前端 Lint 通过：`npm run lint`
- [ ] 后端 Lint 通过：`ruff check app/`

### 11.2 集成测试（每周 / 里程碑）

- [ ] 扫描流程集成测试通过
- [ ] 前后端联调测试通过
- [ ] E2E 核心场景通过
- [ ] 数据库迁移测试通过

### 11.3 发布前测试（版本发布）

- [ ] 完整测试套件通过
- [ ] 性能测试达标
- [ ] 安全测试通过
- [ ] 兼容性测试（Chrome/Firefox/Edge）
- [ ] 生产环境冒烟测试
- [ ] 回滚方案验证

---

## 12. 已知问题与限制

| 问题 | 影响 | 状态 |
|---|---|---|
| 匿名 Reddit 模式速率限制低 | 扫描较慢（10 req/min） | 已知，OAuth 模式可解决 |
| LLM 评分偶发格式错误 | 个别帖子评分失败 | 已处理（跳过并记录日志） |
| Windows 下 Celery 需 --pool=solo | 并发受限 | 已知，Linux 生产环境正常 |
| 前端无独立测试框架 | 测试覆盖不足 | 待补充（Vitest + RTL） |
| 无 E2E 测试 | 回归风险 | 待补充（Playwright） |

---

## 附录：相关文档

- [后端技术方案](./backend-architecture.md)
- [前后端对接文档](./api-integration.md)
- [部署文档](./deployment.md)
- [用户手册](./user-guide.md)
