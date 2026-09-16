import { useCallback, useEffect, useMemo, useState } from "react"
import { api, type ProjectListItem, type OpportunityListItem, type Scan } from "./api/client"
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  BellIcon,
  ClipboardCheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FilterIcon,
  GaugeIcon,
  Loader2Icon,
  PlusIcon,
  RadarIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import "./App.css"

type Page = "new-project" | "scan" | "opportunities" | "settings"
type OpportunityStatus = "New" | "Reviewing" | "Replied" | "Skipped" | "Watch"

// 格式化辅助函数
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const formatRelativeTime = (dateStr: string | null) => {
  if (!dateStr) return "N/A"
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return "Just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

type Opportunity = {
  id: number
  title: string
  subreddit: string
  intent: string
  priority: "High" | "Medium" | "Watch"
  score: number
  age: string
  activity: string
  query: string
  summary: string
  status: OpportunityStatus
  risk: "Low" | "Medium" | "High"
  why: string
  angle: string
  avoid: string
  content: string
  breakdown: { label: string; score: string; note: string }[]
}

function App() {
  const [page, setPage] = useState<Page>("opportunities")
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [quickFilter, setQuickFilter] = useState<"all" | "high" | "new" | "unreplied">("all")
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isLoadingOpportunities, setIsLoadingOpportunities] = useState(false)
  const [currentScan, setCurrentScan] = useState<Scan | null>(null)
  const [scanPollTimer, setScanPollTimer] = useState<number | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null
  const currentProjectName = currentProject?.name ?? ""
  const hasNoProject = !currentProject && !isLoadingProjects

  // 获取项目列表
  useEffect(() => {
    let mounted = true
    api.listProjects()
      .then((data) => {
        if (!mounted) return
        setProjects(data)
        if (data.length > 0 && !currentProjectId) {
          setCurrentProjectId(data[0].id)
        }
      })
      .catch((err) => console.error("Failed to load projects:", err))
      .finally(() => mounted && setIsLoadingProjects(false))
    return () => { mounted = false }
  }, [])

  // 获取机会列表（项目切换时）
  const loadOpportunities = useCallback(async (projectId: string) => {
    setIsLoadingOpportunities(true)
    try {
      const data = await api.listOpportunities(projectId, { page_size: 100, sort: "score", order: "desc" })
      setOpportunities(data.items)
    } catch (err) {
      console.error("Failed to load opportunities:", err)
      setOpportunities([])
    } finally {
      setIsLoadingOpportunities(false)
    }
  }, [])

  useEffect(() => {
    if (currentProjectId && page === "opportunities") {
      loadOpportunities(currentProjectId)
    }
  }, [currentProjectId, page, loadOpportunities])

  // 扫描进度轮询
  const pollScanProgress = useCallback(async (scanId: string) => {
    try {
      const scan = await api.getScan(scanId)
      setCurrentScan(scan)
      if (scan.status === "running" || scan.status === "pending") {
        const timer = window.setTimeout(() => pollScanProgress(scanId), 3000)
        setScanPollTimer(timer)
      } else {
        setIsScanning(false)
        // 扫描完成，刷新机会列表
        if (currentProjectId) {
          loadOpportunities(currentProjectId)
        }
      }
    } catch (err) {
      console.error("Failed to poll scan:", err)
    }
  }, [currentProjectId, loadOpportunities])

  // 触发扫描
  const triggerScan = useCallback(async (projectId: string) => {
    setIsScanning(true)
    try {
      const result = await api.triggerScan(projectId)
      setPage("scan")
      pollScanProgress(result.scan_id)
    } catch (err) {
      console.error("Failed to trigger scan:", err)
      setIsScanning(false)
    }
  }, [pollScanProgress])

  // 清理轮询
  useEffect(() => {
    return () => {
      if (scanPollTimer) clearTimeout(scanPollTimer)
    }
  }, [scanPollTimer])

  const selectedOpportunity = opportunities.find((item) => item.id === selectedId) ?? null
  const filteredOpportunities = useMemo(() => {
    let items = opportunities
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter.toLowerCase())
    }
    if (quickFilter === "high") {
      items = items.filter((item) => item.priority === "high")
    } else if (quickFilter === "new") {
      items = items.filter((item) => item.status === "new")
    } else if (quickFilter === "unreplied") {
      items = items.filter((item) => item.status !== "replied" && item.status !== "skipped")
    }
    return items
  }, [opportunities, statusFilter, quickFilter])

  const updateStatus = useCallback(async (id: string, status: OpportunityStatus) => {
    // 本地状态映射到后端小写格式
    const backendStatus = status.toLowerCase()
    setOpportunities((items) =>
      items.map((item) => (item.id === id ? { ...item, status: backendStatus as OpportunityListItem["status"] } : item))
    )
    try {
      await api.updateOpportunityStatus(id, backendStatus)
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }, [])

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <RadarIcon className="size-4" />
              </div>
              <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">Scoutly</span>
                <span className="truncate text-xs text-muted-foreground">Reddit intent desk</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {isLoadingProjects ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled>
                        <Loader2Icon className="animate-spin" />
                        <span>Loading...</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : projects.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled>
                        <FileTextIcon />
                        <span>No projects</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        isActive={project.id === currentProjectId && page === "opportunities"}
                        onClick={() => {
                          setCurrentProjectId(project.id)
                          setPage("opportunities")
                          setSelectedId(null)
                          setIsDetailOpen(false)
                          setStatusFilter("all")
                          setQuickFilter("all")
                        }}
                        tooltip={project.name}
                      >
                        <FileTextIcon />
                        <span>{project.name}</span>
                        {project.high_priority_count > 0 ? (
                          <Badge variant="secondary" className="ml-auto">{project.high_priority_count}</Badge>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter>
            <Button
              size="sm"
              onClick={() => setPage("new-project")}
              className="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
            >
              <PlusIcon className="group-data-[collapsible=icon]:size-4" />
              <span className="group-data-[collapsible=icon]:hidden">New project</span>
            </Button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="flex h-14 items-center justify-between gap-3 border-b px-4">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {page === "opportunities"
                    ? currentProjectName
                      ? `${currentProjectName} / Opportunities`
                      : "Opportunities"
                    : page === "new-project"
                      ? "New project"
                      : page === "settings"
                        ? currentProjectName
                          ? `${currentProjectName} / Settings`
                          : "Settings"
                        : currentProjectName
                          ? `${currentProjectName} / Scan`
                          : "Scan"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentProject?.last_scan_at
                    ? `Last scan ${new Date(currentProject.last_scan_at).toLocaleString()}`
                    : "No scan yet"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" size="icon-sm" />}>
                  <BellIcon />
                  <span className="sr-only">Alerts</span>
                </TooltipTrigger>
                <TooltipContent>Alerts</TooltipContent>
              </Tooltip>
            </div>
          </header>
          {page === "new-project" ? (
            <NewProject
              onCreated={(projectId) => {
                setCurrentProjectId(projectId)
                triggerScan(projectId)
              }}
            />
          ) : null}
          {page === "scan" ? (
            <ScanProgress
              scan={currentScan}
              onViewResults={() => setPage("opportunities")}
            />
          ) : null}
          {page === "opportunities" ? (
            hasNoProject ? (
              <EmptyState onCreate={() => setPage("new-project")} />
            ) : (
              <Opportunities
                projectName={currentProjectName}
                stats={{
                  total: currentProject?.total_opportunities ?? 0,
                  high: currentProject?.high_priority_count ?? 0,
                  unreviewed: opportunities.filter((o) => o.status === "new" || o.status === "reviewing").length,
                  replied: opportunities.filter((o) => o.status === "replied").length,
                }}
                opportunities={filteredOpportunities}
                selectedId={selectedId}
                statusFilter={statusFilter}
                onFilterChange={setStatusFilter}
                quickFilter={quickFilter}
                onQuickFilterChange={setQuickFilter}
                onSettings={() => setPage("settings")}
                onSelect={(id) => {
                  setSelectedId(id)
                  setIsDetailOpen(true)
                }}
                onStatusChange={updateStatus}
                onExport={() => setIsExportOpen(true)}
                onRunScan={() => currentProjectId && triggerScan(currentProjectId)}
                isScanning={isScanning}
                isLoading={isLoadingOpportunities}
              />
            )
          ) : null}
          {page === "settings" ? (
            <Settings
              projectId={currentProjectId}
              lastScanAt={currentProject?.last_scan_at ?? null}
              lastScanStatus={currentProject?.last_scan_status ?? null}
              onBack={() => setPage("opportunities")}
              onRunScan={() => currentProjectId && triggerScan(currentProjectId)}
              onSaved={async () => {
                const projects = await api.listProjects()
                setProjects(projects)
              }}
            />
          ) : null}
        </SidebarInset>
      </SidebarProvider>
      <OpportunitySheet
        opportunity={selectedOpportunity}
        open={isDetailOpen && page === "opportunities"}
        onOpenChange={setIsDetailOpen}
        onStatusChange={updateStatus}
      />
      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        projectId={currentProjectId}
      />
    </TooltipProvider>
  )
}

function NewProject({ onCreated }: { onCreated: (projectId: string) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: "PostPilot",
    url: "https://postpilot.example",
    description: "An AI tool that helps SaaS teams find and respond to high-intent Reddit discussions.",
    keywords: "reddit marketing, community growth, ai seo, social listening",
    competitors: "GummySearch, Syften, F5Bot",
    include: "r/SaaS, r/startups",
    exclude: "r/funny, r/memes",
  })

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const project = await api.createProject({
        name: form.name,
        url: form.url,
        description: form.description,
        keywords: form.keywords.split(",").map((s) => s.trim()).filter(Boolean),
        competitors: form.competitors.split(",").map((s) => s.trim()).filter(Boolean),
        include_subreddits: form.include.split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
        exclude_subreddits: form.exclude.split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
      })
      onCreated(project.id)
    } catch (err) {
      console.error("Failed to create project:", err)
      alert("创建项目失败，请检查网络连接后重试。")
    } finally {
      setIsSubmitting(false)
    }
  }

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="New project" description="Add a product and discovery inputs." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Project setup</CardTitle>
            <CardDescription>Use at least three keywords to start a scan.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="product-name">Product name</FieldLabel>
                <Input id="product-name" value={form.name} onChange={update("name")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-url">Product URL</FieldLabel>
                <Input id="product-url" value={form.url} onChange={update("url")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="description">One-line description</FieldLabel>
                <Textarea id="description" value={form.description} onChange={update("description")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="keywords">Keywords</FieldLabel>
                <Input id="keywords" value={form.keywords} onChange={update("keywords")} />
                <FieldDescription>Separate keywords with commas. Use 3 to 8 keywords.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="competitors">Competitors</FieldLabel>
                <Input id="competitors" value={form.competitors} onChange={update("competitors")} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="include">Include subreddits</FieldLabel>
                  <Input id="include" value={form.include} onChange={update("include")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="exclude">Exclude subreddits</FieldLabel>
                  <Input id="exclude" value={form.exclude} onChange={update("exclude")} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon data-icon="inline-start" />}
                  {isSubmitting ? "Creating..." : "Start scan"}
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Generated query types</CardTitle>
            <CardDescription>Preview of how Scoutly expands your inputs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {["Recommendation", "Alternative", "Comparison", "Purchase validation", "Pain point"].map(
              (item) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={item}>
                  <span className="text-sm font-medium">{item}</span>
                  <Badge variant="secondary">Ready</Badge>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function ScanProgress({ scan, onViewResults }: { scan: Scan | null; onViewResults: () => void }) {
  const progress = scan?.progress
  const totalScored = progress?.opportunities_scored ?? 0
  const totalToScore = progress?.total_to_score ?? 0
  const percent = totalToScore > 0 ? Math.round((totalScored / totalToScore) * 100) : scan?.status === "completed" ? 100 : 10
  const isRunning = scan?.status === "running" || scan?.status === "pending"
  const isFailed = scan?.status === "failed"

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Scanning Reddit opportunities"
        description="Scoring posts for buying intent, product fit, and reply feasibility."
        action={
          <Button variant="outline" onClick={onViewResults}>
            <EyeIcon data-icon="inline-start" />
            View partial results
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isRunning ? <Loader2Icon className="size-4 animate-spin" /> : isFailed ? <ShieldAlertIcon className="size-4 text-destructive" /> : <ClipboardCheckIcon className="size-4 text-green-600" />}
            {isFailed ? "Scan failed" : isRunning ? "Scan in progress" : "Scan completed"}
          </CardTitle>
          <CardDescription>
            {isFailed ? scan?.error_message : isRunning ? "Fetching posts and scoring with AI..." : `Found ${totalScored} opportunities.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Progress value={percent} />
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Generated queries", String(progress?.queries_generated ?? 0)],
              ["Candidate posts", String(progress?.candidates_fetched ?? 0)],
              ["Duplicates removed", String(progress?.duplicates_removed ?? 0)],
              ["Opportunities scored", `${totalScored}${totalToScore > 0 ? ` / ${totalToScore}` : ""}`],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          {isRunning ? (
            <p className="text-xs text-muted-foreground">Auto-refreshing every 3 seconds. You can view partial results at any time.</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <RadarIcon className="size-7 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold">Create your first project</h2>
          <p className="text-sm text-muted-foreground">
            Add a product URL and keywords, then run a scan to find high-intent Reddit discussions worth replying to.
          </p>
        </div>
        <Button onClick={onCreate} className="mt-2">
          <PlusIcon data-icon="inline-start" />
          New project
        </Button>
      </div>
    </main>
  )
}

function Opportunities({
  projectName,
  stats,
  opportunities,
  selectedId,
  statusFilter,
  quickFilter,
  onFilterChange,
  onQuickFilterChange,
  onSettings,
  onSelect,
  onStatusChange,
  onExport,
  onRunScan,
  isLoading,
  isScanning,
}: {
  projectName: string
  stats: { total: number; high: number; unreviewed: number; replied: number }
  opportunities: OpportunityListItem[]
  selectedId: string | null
  statusFilter: string
  quickFilter: "all" | "high" | "new" | "unreplied"
  onFilterChange: (value: string) => void
  onQuickFilterChange: (value: "all" | "high" | "new" | "unreplied") => void
  onSettings: () => void
  onSelect: (id: string) => void
  onStatusChange: (id: string, status: OpportunityStatus) => void
  onExport: () => void
  onRunScan: () => void
  isLoading?: boolean
  isScanning?: boolean
}) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
      {isScanning ? (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5">
          <Loader2Icon className="size-4 animate-spin text-accent" />
          <span className="text-sm font-medium text-accent">Scan in progress...</span>
          <Progress value={undefined} className="h-1 flex-1" />
        </div>
      ) : null}
      <PageHeader
        title={`${projectName} opportunities`}
        description="Prioritized Reddit discussions worth reviewing in this project."
        action={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="icon-sm" onClick={onSettings} />}>
                <SettingsIcon />
                <span className="sr-only">Project settings</span>
              </TooltipTrigger>
              <TooltipContent>Project settings</TooltipContent>
            </Tooltip>
            <Button variant="outline" onClick={onExport}>
              <DownloadIcon data-icon="inline-start" />
              Export report
            </Button>
            <Button onClick={onRunScan} disabled={isScanning}>
              {isScanning ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon data-icon="inline-start" />}
              {isScanning ? "Scanning..." : "Run scan"}
            </Button>
          </div>
        }
      />
      <StatStrip stats={stats} onFilter={onQuickFilterChange} />
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>Reddit threads</CardTitle>
              <CardDescription>Default view hides low-intent posts.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterIcon className="size-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(nextValue) => {
                  if (nextValue) onFilterChange(nextValue)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Reviewing">Reviewing</SelectItem>
                    <SelectItem value="Replied">Replied</SelectItem>
                    <SelectItem value="Watch">Watch</SelectItem>
                    <SelectItem value="Skipped">Skipped</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon-sm">
                <SearchIcon />
                <span className="sr-only">Search</span>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All" },
              { id: "high", label: "High priority" },
              { id: "new", label: "New" },
              { id: "unreplied", label: "Unreplied" },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => onQuickFilterChange(chip.id as typeof quickFilter)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  quickFilter === chip.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading opportunities...</p>
            </div>
          ) : opportunities.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>No opportunities in this view</EmptyTitle>
                <EmptyDescription>Change filters or run a broader scan.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => { onFilterChange("all"); onQuickFilterChange("all") }}>
                  Reset filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
            <div className="w-full min-w-0 overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px] text-left">Score</TableHead>
                    <TableHead className="w-[340px] text-left">Thread</TableHead>
                    <TableHead className="hidden w-[120px] text-left md:table-cell">Intent</TableHead>
                    <TableHead className="hidden w-[130px] text-left lg:table-cell">Subreddit</TableHead>
                    <TableHead className="hidden w-[100px] text-left md:table-cell">Activity</TableHead>
                    <TableHead className="w-[100px] text-left">Status</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((item) => {
                    const isHigh = item.priority === "high"
                    return (
                    <TableRow
                      key={item.id}
                      data-state={selectedId === item.id ? "selected" : undefined}
                      className={`cursor-pointer transition-colors ${
                        selectedId === item.id
                          ? "bg-primary/5 hover:bg-primary/5"
                          : isHigh
                          ? "bg-accent/10 hover:bg-accent/15"
                          : ""
                      }`}
                      onClick={() => onSelect(item.id)}
                    >
                      <TableCell className="w-[80px] text-left align-middle">
                        <ScoreBadge score={item.score} priority={capitalize(item.priority) as "High" | "Medium" | "Watch"} />
                      </TableCell>
                      <TableCell className="w-[340px] max-w-[340px] overflow-hidden text-left align-middle">
                        <div className="flex min-w-0 w-full flex-col gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block w-full truncate text-left font-medium cursor-help">{item.title}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md">
                              <p className="text-sm">{item.title}</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="block w-full truncate text-sm text-muted-foreground">
                            {item.summary || "No summary available"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden w-[120px] text-left align-middle md:table-cell">
                        <Badge variant="secondary" className="truncate">{item.intent_type ? capitalize(item.intent_type.replace("_", " ")) : "N/A"}</Badge>
                      </TableCell>
                      <TableCell className="hidden w-[130px] truncate text-left align-middle lg:table-cell">{item.subreddit ? `r/${item.subreddit}` : "N/A"}</TableCell>
                      <TableCell className="hidden w-[100px] text-left align-middle md:table-cell">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate">{item.num_comments} comments</span>
                          <span className="truncate text-xs text-muted-foreground">{formatRelativeTime(item.posted_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[100px] text-left align-middle" onClick={(event) => event.stopPropagation()}>
                        <StatusSelect
                          value={capitalize(item.status) as OpportunityStatus}
                          onChange={(value) => onStatusChange(item.id, value)}
                        />
                      </TableCell>
                      <TableCell className="w-[100px] text-right align-middle" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="icon-sm" onClick={() => onSelect(item.id)}>
                            <EyeIcon />
                            <span className="sr-only">View</span>
                          </Button>
                          <Button variant="ghost" size="icon-sm">
                            <CopyIcon />
                            <span className="sr-only">Copy angle</span>
                          </Button>
                          <Button variant="ghost" size="icon-sm">
                            <ArrowUpRightIcon />
                            <span className="sr-only">Open Reddit post</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>
                Showing {opportunities.length} of {stats.total} opportunities
              </span>
              <span>Sorted by score</span>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function Settings({
  projectId,
  lastScanAt,
  lastScanStatus,
  onBack,
  onRunScan,
  onSaved,
}: {
  projectId: string | null
  lastScanAt: string | null
  lastScanStatus: string | null
  onBack: () => void
  onRunScan: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: "",
    url: "",
    description: "",
    keywords: "",
    competitors: "",
    include: "",
    exclude: "",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 加载项目详情
  useEffect(() => {
    if (!projectId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    api
      .getProject(projectId)
      .then((project) => {
        if (cancelled) return
        setForm({
          name: project.name ?? "",
          url: project.url ?? "",
          description: project.description ?? "",
          keywords: (project.keywords ?? []).join(", "),
          competitors: (project.competitors ?? []).join(", "),
          include: (project.include_subreddits ?? []).join(", "),
          exclude: (project.exclude_subreddits ?? []).join(", "),
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Failed to load project:", err)
        setLoadError(err instanceof Error ? err.message : "Failed to load project settings")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [projectId])

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!projectId) return
    setIsSaving(true)
    try {
      await api.updateProject(projectId, {
        name: form.name,
        url: form.url || undefined,
        description: form.description || undefined,
        keywords: form.keywords.split(",").map((s) => s.trim()).filter(Boolean),
        competitors: form.competitors.split(",").map((s) => s.trim()).filter(Boolean),
        include_subreddits: form.include.split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
        exclude_subreddits: form.exclude.split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
      })
      onSaved()
    } catch (err) {
      console.error("Failed to save project:", err)
      alert("保存设置失败，请检查网络连接后重试。")
    } finally {
      setIsSaving(false)
    }
  }

  if (!projectId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </main>
    )
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start gap-2">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={onBack} />}>
            <ArrowLeftIcon />
            <span className="sr-only">Back to opportunities</span>
          </TooltipTrigger>
          <TooltipContent>Back to opportunities</TooltipContent>
        </Tooltip>
        <PageHeader title="Project settings" description="Update discovery inputs and scan settings." />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <ShieldAlertIcon className="size-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load project settings</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => projectId && window.location.reload()}>
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Discovery configuration</CardTitle>
              <CardDescription>Changes apply to the next scan.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="settings-name">Product name</FieldLabel>
                    <Input id="settings-name" value={form.name} onChange={update("name")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="settings-url">Product URL</FieldLabel>
                    <Input id="settings-url" value={form.url} onChange={update("url")} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="settings-desc">One-line description</FieldLabel>
                  <Textarea id="settings-desc" value={form.description} onChange={update("description")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-keywords">Keywords</FieldLabel>
                  <Input id="settings-keywords" value={form.keywords} onChange={update("keywords")} />
                  <FieldDescription>Separate with commas. Used to generate Reddit search queries.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-competitors">Competitors</FieldLabel>
                  <Input id="settings-competitors" value={form.competitors} onChange={update("competitors")} />
                  <FieldDescription>Brand names to watch for in comparison threads.</FieldDescription>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="settings-include">Include subreddits</FieldLabel>
                    <Input id="settings-include" value={form.include} onChange={update("include")} />
                    <FieldDescription>Limit scan to these communities.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="settings-exclude">Exclude subreddits</FieldLabel>
                    <Input id="settings-exclude" value={form.exclude} onChange={update("exclude")} />
                    <FieldDescription>Skip these communities entirely.</FieldDescription>
                  </Field>
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2Icon className="size-4 animate-spin" /> : <ClipboardCheckIcon data-icon="inline-start" />}
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scan</CardTitle>
              <CardDescription>Manual scans only in MVP.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Last scan</span>
                  <Badge variant={lastScanStatus === "completed" ? "secondary" : lastScanStatus === "failed" ? "destructive" : "outline"}>
                    {lastScanStatus ? capitalize(lastScanStatus) : "Never"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {lastScanAt ? new Date(lastScanAt).toLocaleString() : "No scans run yet."}
                </span>
              </div>
              <Button onClick={onRunScan}>
                <RefreshCwIcon data-icon="inline-start" />
                Run scan now
              </Button>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-muted-foreground">Weekly alerts</span>
                  <span className="text-xs text-muted-foreground">Planned for V1.1.</span>
                </div>
                <Badge variant="outline">Soon</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function OpportunitySheet({
  opportunity,
  open,
  onOpenChange,
  onStatusChange,
}: {
  opportunity: OpportunityListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (id: string, status: OpportunityStatus) => void
}) {
  const [detail, setDetail] = useState<Opportunity | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  useEffect(() => {
    if (open && opportunity?.id) {
      setIsLoadingDetail(true)
      api.getOpportunity(opportunity.id)
        .then((data) => {
          // 转换 API 数据为前端显示格式
          setDetail({
            id: 0,
            title: data.title,
            subreddit: data.subreddit ? `r/${data.subreddit}` : "N/A",
            intent: data.intent_type ? capitalize(data.intent_type.replace("_", " ")) : "N/A",
            priority: capitalize(data.priority) as "High" | "Medium" | "Watch",
            score: data.score,
            age: formatRelativeTime(data.posted_at),
            activity: `${data.num_comments} comments`,
            query: "",
            summary: data.summary ?? "",
            status: capitalize(data.status) as OpportunityStatus,
            risk: capitalize(data.risk_level) as "Low" | "Medium" | "High",
            why: (data as any).why_this_matters ?? data.summary ?? "",
            angle: data.suggested_angle ?? "",
            avoid: data.what_not_to_do ?? "",
            content: data.content_opportunity ?? "",
            breakdown: data.score_breakdowns.map((bd) => ({
              label: bd.dimension.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              score: `${bd.score}/${bd.max_score}`,
              note: bd.note ?? "",
            })),
          })
        })
        .catch((err) => console.error("Failed to load opportunity detail:", err))
        .finally(() => setIsLoadingDetail(false))
    } else {
      setDetail(null)
    }
  }, [open, opportunity?.id])

  if (!opportunity) return null

  const display = detail ?? {
    title: opportunity.title,
    subreddit: opportunity.subreddit ? `r/${opportunity.subreddit}` : "N/A",
    intent: opportunity.intent_type ? capitalize(opportunity.intent_type.replace("_", " ")) : "N/A",
    priority: capitalize(opportunity.priority) as "High" | "Medium" | "Watch",
    score: opportunity.score,
    age: formatRelativeTime(opportunity.posted_at),
    activity: `${opportunity.num_comments} comments`,
    summary: opportunity.summary ?? "",
    status: capitalize(opportunity.status) as OpportunityStatus,
    risk: capitalize(opportunity.risk_level) as "Low" | "Medium" | "High",
    why: opportunity.summary ?? "",
    angle: "Loading...",
    avoid: "Loading...",
    content: "Loading...",
    breakdown: [] as { label: string; score: string; note: string }[],
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{display.title}</SheetTitle>
          <SheetDescription>
            {display.subreddit} · {display.age} · {display.activity}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <ScoreBadge score={display.score} priority={display.priority} />
            <Badge variant="secondary">{display.intent}</Badge>
            <Badge variant={display.risk === "High" ? "destructive" : "outline"}>
              {display.risk} risk
            </Badge>
          </div>
          {display.risk === "High" ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlertIcon className="size-4" />
                  High promotion risk
                </CardTitle>
                <CardDescription>
                  Consider giving neutral advice or skipping product mention.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading details...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <SparklesIcon className="size-4 text-accent" />
                  AI Insights
                </h3>
                <Button variant="ghost" size="sm" disabled>
                  <RefreshCwIcon className="size-3" />
                  Regenerate
                </Button>
              </div>
              <DetailSection title="Why this matters" body={display.why} isLoading={isLoadingDetail} />
              <DetailSection title="Suggested angle" body={display.angle} isLoading={isLoadingDetail} />
              <DetailSection title="What not to do" body={display.avoid} isLoading={isLoadingDetail} />
              <DetailSection title="Content opportunity" body={display.content} isLoading={isLoadingDetail} />
              {display.breakdown.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Score breakdown</CardTitle>
                    <CardDescription>Each item explains part of the total score.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {display.breakdown.map((item) => (
                      <div className="flex flex-col gap-2 rounded-lg border p-3" key={item.label}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{item.label}</span>
                          <Badge variant="outline">{item.score}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.note}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <StatusSelect
              value={display.status}
              onChange={(value) => onStatusChange(opportunity.id, value)}
            />
            <div className="flex gap-2">
              <Button variant="outline">
                <CopyIcon data-icon="inline-start" />
                Copy angle
              </Button>
              <Button onClick={() => opportunity.url && window.open(opportunity.url, "_blank")}>
                <ArrowUpRightIcon data-icon="inline-start" />
                Open post
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ExportDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
}) {
  const [format, setFormat] = useState("markdown")
  const [range, setRange] = useState("all")
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (!projectId) return
    setIsExporting(true)
    try {
      await api.exportOpportunities(projectId, format as "markdown" | "csv", range)
      onOpenChange(false)
    } catch (err) {
      console.error("Export failed:", err)
      alert("导出报告失败，请检查网络连接后重试。")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export report</DialogTitle>
          <DialogDescription>Choose a report format and what to include.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Format</FieldLabel>
            <Select value={format} onValueChange={(v) => v && setFormat(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="markdown">Markdown client report</SelectItem>
                  <SelectItem value="csv">CSV for Google Sheets</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Range</FieldLabel>
            <Select value={range} onValueChange={(v) => v && setRange(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All opportunities</SelectItem>
                  <SelectItem value="high">High priority only</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !projectId}>
            {isExporting ? <Loader2Icon className="size-4 animate-spin" /> : <DownloadIcon data-icon="inline-start" />}
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function StatStrip({ stats, onFilter }: { stats: { total: number; high: number; unreviewed: number; replied: number }; onFilter?: (filter: "all" | "high" | "new" | "unreplied") => void }) {
  const items = [
    { value: stats.total, label: "total", filter: "all" as const },
    { value: stats.high, label: "high priority", filter: "high" as const },
    { value: stats.unreviewed, label: "unreviewed", filter: "new" as const },
    { value: stats.replied, label: "replied", filter: "unreplied" as const },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2.5">
      {items.map((item, index) => (
        <button
          key={item.label}
          onClick={() => onFilter?.(item.filter)}
          className="flex items-baseline gap-1.5 rounded transition-colors hover:bg-muted/50 px-1 -mx-1"
        >
          {index > 0 ? <span className="text-xs text-muted-foreground">·</span> : null}
          <span className={`text-base font-semibold tabular-nums ${item.label === "high priority" ? "text-accent" : ""}`}>{item.value}</span>
          <span className={`text-xs ${item.label === "high priority" ? "text-accent/80" : "text-muted-foreground"}`}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function ScoreBadge({ score, priority }: { score: number; priority: Opportunity["priority"] }) {
  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={priority === "High" ? "default" : priority === "Medium" ? "secondary" : "outline"}
        className={priority === "High" ? "bg-accent text-accent-foreground hover:bg-accent/90 border-0" : ""}
      >
        <GaugeIcon className="size-3" />
        {score}
      </Badge>
      <span className={`text-xs ${priority === "High" ? "text-accent font-medium" : "text-muted-foreground"}`}>{priority}</span>
    </div>
  )
}

function StatusSelect({
  value,
  onChange,
}: {
  value: OpportunityStatus
  onChange: (value: OpportunityStatus) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onChange(nextValue as OpportunityStatus)
      }}
    >
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="New">New</SelectItem>
          <SelectItem value="Reviewing">Reviewing</SelectItem>
          <SelectItem value="Replied">Replied</SelectItem>
          <SelectItem value="Skipped">Skipped</SelectItem>
          <SelectItem value="Watch">Watch</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function DetailSection({ title, body, isLoading }: { title: string; body: string; isLoading?: boolean }) {
  const isEmpty = !body || body === "No suggestion available yet." || body === "No risk notes available." || body === "No content opportunity identified." || body === "Loading..."
  return (
    <Card className="border-l-2 border-l-accent bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4 text-accent" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ) : isEmpty ? (
          <p className="text-sm leading-6 text-muted-foreground/60 italic">AI insight not available for this opportunity yet.</p>
        ) : (
          <p className="text-sm leading-6 text-foreground/90">{body}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default App
