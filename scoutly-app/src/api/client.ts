// API 客户端 - 与后端 ThreadScout API 对接

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1"
const API_KEY = import.meta.env.VITE_API_KEY || ""

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (API_KEY) headers["X-API-Key"] = API_KEY
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  if (response.status === 204) return null as T
  return response.json()
}

// ============ 类型定义 ============

export interface Project {
  id: string
  name: string
  url: string | null
  description: string | null
  keywords: string[]
  competitors: string[]
  include_subreddits: string[]
  exclude_subreddits: string[]
  created_at: string
  updated_at: string
}

export interface ProjectListItem {
  id: string
  name: string
  url: string | null
  description: string | null
  created_at: string
  total_opportunities: number
  high_priority_count: number
  last_scan_status: string | null
  last_scan_at: string | null
}

export interface ProjectCreate {
  name: string
  url?: string
  description?: string
  keywords?: string[]
  competitors?: string[]
  include_subreddits?: string[]
  exclude_subreddits?: string[]
}

export interface ScanProgress {
  queries_generated: number
  candidates_fetched: number
  duplicates_removed: number
  opportunities_scored: number
  total_to_score: number
}

export interface Scan {
  id: string
  project_id: string
  status: "pending" | "running" | "completed" | "failed"
  progress: ScanProgress
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface ScanCreateResponse {
  scan_id: string
  status: string
  message: string
}

export interface ScoreBreakdown {
  dimension: string
  score: number
  max_score: number
  note: string | null
}

export interface Opportunity {
  id: string
  scan_id: string
  project_id: string
  reddit_post_id: string
  title: string
  url: string | null
  subreddit: string | null
  author: string | null
  selftext: string | null
  num_comments: number
  upvote_ratio: number | null
  posted_at: string | null
  score: number
  priority: "high" | "medium" | "watch"
  intent_type: string | null
  risk_level: "low" | "medium" | "high"
  status: "new" | "reviewing" | "replied" | "skipped" | "watch"
  summary: string | null
  suggested_angle: string | null
  what_not_to_do: string | null
  content_opportunity: string | null
  score_breakdowns: ScoreBreakdown[]
  created_at: string
  updated_at: string
}

export interface OpportunityListItem {
  id: string
  title: string
  url: string | null
  subreddit: string | null
  score: number
  priority: "high" | "medium" | "watch"
  intent_type: string | null
  risk_level: "low" | "medium" | "high"
  status: "new" | "reviewing" | "replied" | "skipped" | "watch"
  num_comments: number
  posted_at: string | null
  summary: string | null
}

export interface OpportunityListResponse {
  items: OpportunityListItem[]
  total: number
  page: number
  page_size: number
}

// ============ API 方法 ============

export const api = {
  // 项目
  listProjects: () => request<ProjectListItem[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: ProjectCreate) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<ProjectCreate>) => request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  // 扫描
  triggerScan: (projectId: string) => request<ScanCreateResponse>(`/projects/${projectId}/scan`, { method: "POST" }),
  getScan: (scanId: string) => request<Scan>(`/scans/${scanId}`),
  listProjectScans: (projectId: string) => request<Scan[]>(`/projects/${projectId}/scans`),

  // 机会
  listOpportunities: (
    projectId: string,
    params: {
      page?: number
      page_size?: number
      status?: string
      priority?: string
      intent_type?: string
      sort?: string
      order?: string
      search?: string
    } = {}
  ) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.set(k, String(v))
    })
    const qs = query.toString()
    return request<OpportunityListResponse>(`/projects/${projectId}/opportunities${qs ? `?${qs}` : ""}`)
  },

  getOpportunity: (id: string) => request<Opportunity>(`/opportunities/${id}`),
  updateOpportunityStatus: (id: string, status: string) =>
    request<Opportunity>(`/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // 导出
  exportOpportunities: async (projectId: string, format: "markdown" | "csv", range: string = "all", statusFilter?: string[]) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (API_KEY) headers["X-API-Key"] = API_KEY

    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ format, range, status_filter: statusFilter }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `scoutly-export.${format}`
    a.click()
    window.URL.revokeObjectURL(url)
  },
}
