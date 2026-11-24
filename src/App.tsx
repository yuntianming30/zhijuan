import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  BookPlus,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileStack,
  FolderKanban,
  GraduationCap,
  History,
  Layers3,
  LoaderCircle,
  Network,
  Settings,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import MindMapView from "./components/MindMapView";
import ExamWorkspace from "./components/ExamWorkspace";
import SettingsWorkspace from "./components/SettingsWorkspace";
import CourseDialog from "./components/CourseDialog";
import CourseMaterialsWorkspace from "./components/CourseMaterialsWorkspace";
import FavoritesWorkspace from "./components/FavoritesWorkspace";
import HistoryWorkspace from "./components/HistoryWorkspace";
import WrongBookWorkspace from "./components/WrongBookWorkspace";
import { demoGraph } from "./data/demoGraph";
import {
  addMaterials,
  createCourse,
  DATA_CHANGED_EVENT,
  loadActiveCourseId,
  loadCourses,
  loadMaterials,
  recordStudyEvent,
  removeMaterial,
  saveActiveCourseId,
} from "./data/localStore";
import type {
  CourseDefinition,
  CourseMaterial,
  NewCourseInput,
} from "./data/localStore";
import type {
  DemoKnowledgeGraph,
  Evidence,
  KnowledgeNode,
  ReviewDepth,
} from "./types";

type NavItem = {
  id: "materials" | "review" | "exam" | "history" | "wrong" | "favorites";
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const navItems: NavItem[] = [
  { id: "materials", label: "课程资料", icon: FolderKanban },
  { id: "review", label: "复习导图", icon: Network },
  { id: "exam", label: "模拟考试", icon: ClipboardCheck },
  { id: "history", label: "历史记录", icon: History },
  { id: "wrong", label: "错题本", icon: BookOpen },
  { id: "favorites", label: "收藏", icon: Star },
];

type AppView = NavItem["id"] | "settings";

const viewLabels: Record<AppView, string> = {
  materials: "课程资料",
  review: "复习导图",
  exam: "模拟考试",
  history: "历史记录",
  wrong: "错题本",
  favorites: "收藏",
  settings: "设置",
};

const depthOptions: Array<{
  value: ReviewDepth;
  label: string;
  hint: string;
}> = [
  { value: "quick", label: "15 分钟", hint: "只看必考" },
  { value: "focused", label: "30 分钟", hint: "核心与重点" },
  { value: "complete", label: "完整梳理", hint: "全部内容" },
];

const importanceLabel: Record<KnowledgeNode["importance"], string> = {
  core: "必须掌握",
  important: "重点复习",
  normal: "补充了解",
};

const nodeTypeClass: Record<KnowledgeNode["type"], string> = {
  概念: "type-concept",
  方法: "type-method",
  代码: "type-code",
  易错点: "type-pitfall",
};

function graphStorageKey(courseKey: string) {
  return `stem-review-workbench:last-graph:${courseKey}`;
}

function loadStoredGraph(courseKey: string): DemoKnowledgeGraph | null {
  try {
    const raw =
      window.localStorage.getItem(graphStorageKey(courseKey)) ??
      (courseKey === "oop"
        ? window.localStorage.getItem("stem-review-workbench:last-graph")
        : null);
    if (!raw) return courseKey === "oop" ? demoGraph : null;
    const parsed = JSON.parse(raw) as Partial<DemoKnowledgeGraph>;
    if (
      typeof parsed.course === "string" &&
      Array.isArray(parsed.branches) &&
      Array.isArray(parsed.nodes) &&
      parsed.nodes.length > 0
    ) {
      return parsed as DemoKnowledgeGraph;
    }
  } catch {
    // Ignore incompatible or corrupted local state.
  }
  return courseKey === "oop" ? demoGraph : null;
}

function emptyGraph(course: CourseDefinition): DemoKnowledgeGraph {
  return {
    course: course.name,
    subtitle: course.description || "等待添加课程资料",
    language: course.language || "不适用",
    framework: course.framework || "无",
    model: "DeepSeek V4",
    sourceCount: 0,
    summary:
      course.description ||
      "添加课件、复习资料或历年真题后，知卷会在这里生成课程知识导图和复习重点。",
    branches: [],
    nodes: [],
    warnings: [],
  };
}

function App() {
  const [courses, setCourses] = useState<CourseDefinition[]>(loadCourses);
  const [courseKey, setCourseKey] = useState(() => {
    const activeId = loadActiveCourseId();
    const available = loadCourses();
    return available.some((course) => course.id === activeId)
      ? (activeId as string)
      : "oop";
  });
  const [view, setView] = useState<AppView>("review");
  const currentCourse =
    courses.find((course) => course.id === courseKey) ?? courses[0];
  const [depth, setDepth] = useState<ReviewDepth>("focused");
  const [selectedId, setSelectedId] = useState("constructor");
  const [graph, setGraph] = useState<DemoKnowledgeGraph>(
    () =>
      loadStoredGraph(courseKey) ??
      emptyGraph(
        courses.find((course) => course.id === courseKey) ?? courses[0],
      ),
  );
  const [materials, setMaterials] = useState<CourseMaterial[]>(() =>
    loadMaterials(courseKey),
  );
  const [showCourseDialog, setShowCourseDialog] = useState(false);
  const [apiState, setApiState] = useState<
    "checking" | "connected" | "local"
  >("checking");
  const [sampleAvailability, setSampleAvailability] = useState<
    Record<string, boolean>
  >({ oop: true });
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<{
    evidence: Evidence;
    nodeTitle: string;
    excerpt: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        const payload = (await response.json()) as {
          keyConfigured?: boolean;
          sampleAvailable?: Record<string, boolean>;
        };
        if (!cancelled) {
          setApiState(payload.keyConfigured ? "connected" : "local");
          if (payload.sampleAvailable) {
            setSampleAvailability({
              oop: true,
              ...payload.sampleAvailable,
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setApiState("local");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshLocalData = () => {
      setCourses(loadCourses());
      setMaterials(loadMaterials(courseKey));
    };
    window.addEventListener(DATA_CHANGED_EVENT, refreshLocalData);
    return () =>
      window.removeEventListener(DATA_CHANGED_EVENT, refreshLocalData);
  }, [courseKey]);

  useEffect(() => {
    if (!activeEvidence) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveEvidence(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeEvidence]);

  const visibleNodes = useMemo(() => {
    const importanceRank: Record<KnowledgeNode["importance"], number> = {
      core: 0,
      important: 1,
      normal: 2,
    };
    const sortByPriority = (nodes: KnowledgeNode[]) =>
      [...nodes].sort(
        (first, second) =>
          importanceRank[first.importance] - importanceRank[second.importance],
      );

    if (depth === "quick") {
      return sortByPriority(
        graph.nodes.filter((node) => node.importance === "core"),
      );
    }
    if (depth === "focused") {
      return sortByPriority(
        graph.nodes.filter((node) => node.importance !== "normal"),
      );
    }
    return sortByPriority(graph.nodes);
  }, [depth, graph.nodes]);

  useEffect(() => {
    if (!visibleNodes.some((node) => node.id === selectedId)) {
      setSelectedId(visibleNodes[0]?.id ?? graph.nodes[0]?.id ?? "");
    }
  }, [graph.nodes, selectedId, visibleNodes]);

  const selectedNode =
    graph.nodes.find((node) => node.id === selectedId) ??
    graph.nodes[0] ?? {
      id: "empty",
      title: "等待添加课程资料",
      summary: "",
      type: "概念" as const,
      importance: "normal" as const,
      evidence: [],
      branch: "",
      reviewHint: "",
    };

  async function generateKnowledge(files?: File[]) {
    if (isGenerating) return false;
    setIsGenerating(true);
    setNotice(null);
    const form = new FormData();
    form.append("course_name", currentCourse.name);
    form.append("language", currentCourse.language || "不适用");
    form.append("framework", currentCourse.framework || "无");
    form.append("depth", depth);
    form.append("sample_course", currentCourse.sampleCourse ?? "");
    form.append(
      "focus",
      depth === "quick"
        ? "只保留必考和最高优先级内容"
        : depth === "focused"
          ? "优先核心概念、常见题型和易错点"
          : "完整覆盖课程资料中的知识关系",
    );
    for (const file of files ?? []) {
      form.append("files", file);
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            graph?: DemoKnowledgeGraph;
            detail?: string;
          }
        | null;
      if (!response.ok || !payload?.graph) {
        throw new Error(payload?.detail ?? `生成失败（HTTP ${response.status}）`);
      }
      setGraph(payload.graph);
      window.localStorage.setItem(
        graphStorageKey(courseKey),
        JSON.stringify(payload.graph),
      );
      const firstNode =
        payload.graph.nodes.find((node) => node.importance === "core") ??
        payload.graph.nodes[0];
      setSelectedId(firstNode.id);
      setApiState("connected");
      setNotice({
        tone: "success",
        text: `已根据 ${payload.graph.sourceCount} 份资料重新整理知识导图。`,
      });
      if (files?.length) {
        addMaterials(courseKey, files);
      }
      recordStudyEvent({
        courseId: courseKey,
        course: currentCourse.name,
        kind: "graph",
        title: "生成复习导图",
        detail: `根据 ${payload.graph.sourceCount} 份资料生成 ${payload.graph.nodes.length} 个知识节点`,
      });
      return true;
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "生成失败，请检查本地 API 和模型配置。",
      });
      return false;
    } finally {
      setIsGenerating(false);
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files?.length) return;
    void generateKnowledge(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function switchCourse(targetKey: string) {
    if (targetKey === courseKey || isGenerating) return;
    const target = courses.find((course) => course.id === targetKey);
    if (!target) return;

    const stored = loadStoredGraph(targetKey);
    if (stored) {
      const normalizedStored =
        target.language && target.framework
          ? stored
          : { ...stored, language: "不适用", framework: "无" };
      setCourseKey(targetKey);
      setGraph(normalizedStored);
      setSelectedId(
        normalizedStored.nodes.find((node) => node.importance === "core")?.id ??
          normalizedStored.nodes[0].id,
      );
      setView("review");
      saveActiveCourseId(targetKey);
      setMaterials(loadMaterials(targetKey));
      setNotice({
        tone: "success",
        text: `已切换到${stored.course}。`,
      });
      return;
    }

    if (!target.sampleCourse || !isCourseAvailable(targetKey)) {
      setCourseKey(targetKey);
      setGraph(emptyGraph(target));
      setSelectedId("");
      setMaterials(loadMaterials(targetKey));
      saveActiveCourseId(targetKey);
      setView("materials");
      setNotice({
        tone: "info",
        text: `已进入${target.name}，请先添加这门课的资料。`,
      });
      return;
    }

    setIsGenerating(true);
    setNotice({
      tone: "info",
      text: `正在根据${target.name}课件生成首轮知识图谱…`,
    });
    const form = new FormData();
    form.append("course_name", target.name);
    form.append("language", target.language || "不适用");
    form.append("framework", target.framework || "无");
    form.append("depth", "focused");
    form.append("focus", "优先核心概念、常见题型和易错点");
    form.append("sample_course", target.sampleCourse);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as
        | { graph?: DemoKnowledgeGraph; detail?: string }
        | null;
      if (!response.ok || !payload?.graph) {
        throw new Error(payload?.detail ?? `生成失败（HTTP ${response.status}）`);
      }
      setCourseKey(targetKey);
      setGraph(payload.graph);
      setSelectedId(
        payload.graph.nodes.find((node) => node.importance === "core")?.id ??
          payload.graph.nodes[0].id,
      );
      setView("review");
      saveActiveCourseId(targetKey);
      setMaterials(loadMaterials(targetKey));
      window.localStorage.setItem(
        graphStorageKey(targetKey),
        JSON.stringify(payload.graph),
      );
      setNotice({
        tone: "success",
        text: `${target.name}知识图谱已生成，可以开始复习或创建模拟考试。`,
      });
      recordStudyEvent({
        courseId: targetKey,
        course: target.name,
        kind: "graph",
        title: "生成内置样例导图",
        detail: `${payload.graph.nodes.length} 个知识节点`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "课程资料生成失败，请检查模型配置。",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function isCourseAvailable(targetKey: string) {
    return targetKey === "oop" || sampleAvailability[targetKey] === true;
  }

  const modelLabel =
    apiState === "connected"
      ? "DeepSeek V4"
      : apiState === "checking"
        ? "检查模型"
        : "未配置模型";

  function changeView(nextView: AppView) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCreateCourse(input: NewCourseInput) {
    const course = createCourse(input);
    const nextCourses = loadCourses();
    setCourses(nextCourses);
    setCourseKey(course.id);
    setGraph(emptyGraph(course));
    setSelectedId("");
    setMaterials([]);
    saveActiveCourseId(course.id);
    recordStudyEvent({
      courseId: course.id,
      course: course.name,
      kind: "course",
      title: "创建课程",
      detail: "课程已创建，等待添加第一份资料",
    });
    setShowCourseDialog(false);
    setView("materials");
    setNotice({
      tone: "success",
      text: `${course.name}已创建，可以添加资料了。`,
    });
  }

  function openCourse(courseId: string, nextView: "review" | "exam") {
    if (courseId !== courseKey) {
      void switchCourse(courseId);
    }
    setView(nextView);
  }

  const handleModelStatusChange = useCallback((configured: boolean) => {
    setApiState(configured ? "connected" : "local");
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Network size={22} strokeWidth={2.1} />
          </div>
          <div>
            <strong>知卷</strong>
            <span>期末复习工作台</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
                onClick={() => changeView(item.id)}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <div className="section-label-row">
            <div className="section-label">我的课程</div>
            <button
              type="button"
              className="sidebar-add-course"
              aria-label="新建课程"
              title="新建课程"
              onClick={() => setShowCourseDialog(true)}
            >
              <BookPlus size={15} />
            </button>
          </div>
          <div className="course-list">
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={`course-chip ${
                  course.id === courseKey ? "is-current" : ""
                }`}
                disabled={isGenerating}
                onClick={() => void switchCourse(course.id)}
              >
                <span className={`course-dot ${course.accent}`} />
                <span>
                  <strong>{course.name}</strong>
                  <small>
                    {course.id === courseKey
                      ? view === "materials"
                        ? "正在管理资料"
                        : "当前课程"
                      : course.builtIn
                        ? "内置课程"
                        : "自建课程"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="new-course-link"
            onClick={() => setShowCourseDialog(true)}
          >
            <BookPlus size={15} />
            新建课程
          </button>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`nav-item ${view === "settings" ? "is-active" : ""}`}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => changeView("settings")}
          >
            <Settings size={18} strokeWidth={1.9} />
            <span>设置</span>
          </button>
          <div className="local-status">
            <CheckCircle2 size={15} />
            <span>资料仅存本地</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <GraduationCap size={17} />
            <span>{currentCourse.name}</span>
            <ChevronRight size={14} />
            <strong>{viewLabels[view]}</strong>
          </div>
          <div className="topbar-actions">
            <select
              className="course-select"
              aria-label="切换课程"
              value={courseKey}
              disabled={isGenerating}
              onChange={(event) =>
                void switchCourse(event.target.value)
              }
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button new-course-topbar"
              aria-label="新建课程"
              title="新建课程"
              onClick={() => setShowCourseDialog(true)}
            >
              <BookPlus size={17} />
            </button>
            <button
              type="button"
              className={`model-pill ${apiState === "local" ? "is-local" : ""}`}
              title={
                apiState === "connected"
                  ? "DeepSeek V4 文本与视觉模型已配置"
                  : "尚未配置模型，点击查看 DeepSeek 配置说明"
              }
              onClick={() => changeView("settings")}
            >
              <span className="status-dot" />
              {modelLabel}
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(event) => handleFileSelection(event.target.files)}
            />
            <button
              type="button"
              className="button secondary-button"
              disabled={isGenerating}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={17} />
              <span>导入资料</span>
            </button>
            <button
              type="button"
              className="icon-button mobile-settings-button"
              aria-label="打开设置"
              title="打开设置"
              onClick={() => changeView("settings")}
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        <div className="content">
          {notice && view !== "review" ? (
            <div
              className={`generation-notice global-notice ${notice.tone}`}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : notice.tone === "info" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <AlertTriangle size={17} />
              )}
              <span>{notice.text}</span>
              <button
                type="button"
                className="notice-close"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
          <div hidden={view !== "review"}>
          {graph.nodes.length ? (
          <>
          <section className="course-heading">
            <div className="heading-copy">
              <div className="eyebrow">
                <Sparkles size={15} />
                复习总览
              </div>
              <h1>先抓住会考的内容。</h1>
              <p>{graph.summary}</p>
            </div>
            <div className="course-facts" aria-label="课程信息">
              <div className="fact">
                <Layers3 size={17} />
                <span>
                  <strong>{graph.nodes.length}</strong>
                  个知识节点
                </span>
              </div>
              <div className="fact">
                <FileStack size={17} />
                <span>
                  <strong>{graph.sourceCount}</strong>
                  份课程资料
                </span>
              </div>
              <div className="fact">
                <BrainCircuit size={17} />
                <span>
                  <strong>{graph.language}</strong>
                  {graph.framework}
                </span>
              </div>
            </div>
          </section>

          <section className="review-toolbar" aria-label="复习范围">
            <div>
              <span className="toolbar-label">本轮复习深度</span>
              <div className="segmented-control">
                {depthOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={depth === option.value ? "is-selected" : ""}
                    aria-pressed={depth === option.value}
                    onClick={() => setDepth(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="button primary-button"
              disabled={isGenerating}
              aria-busy={isGenerating}
              onClick={() => void generateKnowledge()}
            >
              {isGenerating ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {isGenerating ? "正在梳理…" : "按当前范围重新梳理"}
            </button>
          </section>

          {notice ? (
            <div
              className={`generation-notice ${notice.tone}`}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : notice.tone === "info" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <AlertTriangle size={17} />
              )}
              <span>{notice.text}</span>
              <button
                type="button"
                className="notice-close"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          ) : null}

          <section
            className={`review-workspace ${isGenerating ? "is-busy" : ""}`}
            aria-busy={isGenerating}
          >
            <div className="map-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">KNOWLEDGE MAP</div>
                  <h2>知识关系导图</h2>
                </div>
                <div className="map-legend" aria-label="导图分支">
                  {graph.branches.map((branch) => (
                    <span key={branch.id}>
                      <i style={{ background: branch.color }} />
                      {branch.title}
                    </span>
                  ))}
                </div>
              </div>
              <MindMapView graph={graph} depth={depth} />
              <div className="map-footer">
                <span>滚轮缩放 · 拖动浏览 · 点击圆点展开</span>
                <span>{visibleNodes.length} 个节点已显示</span>
              </div>
            </div>

            <aside className="review-rail">
              <div className="rail-heading">
                <div>
                  <div className="panel-kicker">PRIORITY</div>
                  <h2>复习重点</h2>
                </div>
                <span className="count-badge">{visibleNodes.length}</span>
              </div>
              <p className="rail-intro">
                按考点重要性和资料覆盖度排序，先解决高确定性的内容。
              </p>

              <div className="review-list">
                {visibleNodes.map((node, index) => (
                  <button
                    key={node.id}
                    type="button"
                    className={`review-item ${
                      node.id === selectedId ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedId(node.id)}
                  >
                    <span className="review-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="review-copy">
                      <span className="review-meta">
                        <span className={`type-chip ${nodeTypeClass[node.type]}`}>
                          {node.type}
                        </span>
                        <span className={`priority priority-${node.importance}`}>
                          {importanceLabel[node.importance]}
                        </span>
                      </span>
                      <strong>{node.title}</strong>
                      <small>{node.reviewHint}</small>
                    </span>
                    <ChevronRight size={16} className="review-chevron" />
                  </button>
                ))}
              </div>

              <section className="node-detail" aria-live="polite">
                <div className="detail-topline">
                  <span className={`type-chip ${nodeTypeClass[selectedNode.type]}`}>
                    {selectedNode.type}
                  </span>
                  <span>{importanceLabel[selectedNode.importance]}</span>
                </div>
                <h3>{selectedNode.title}</h3>
                <p>{selectedNode.summary}</p>
                <div className="source-list">
                  {selectedNode.evidence.map((evidence) => (
                    <button
                      key={`${evidence.source}-${evidence.page}`}
                      type="button"
                      className="source-link"
                      onClick={() =>
                        setActiveEvidence({
                          evidence,
                          nodeTitle: selectedNode.title,
                          excerpt: evidence.excerpt ?? selectedNode.summary,
                        })
                      }
                    >
                      <FileStack size={14} />
                      {evidence.source} · 第 {evidence.page} 页
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </section>

          <section className="warning-strip" aria-label="易错提醒">
            <div className="warning-title">
              <AlertTriangle size={18} />
              复习时容易忽略
            </div>
            <div className="warning-items">
              {graph.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          </section>
          </>
          ) : (
            <section className="workspace-empty-state review-empty-state">
              <Network size={28} />
              <h2>这门课还没有知识导图</h2>
              <p>
                先添加课件、复习资料或真题图片。生成成功后，这里会出现思维导图、
                重点清单和资料页码。
              </p>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="button primary-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={17} />
                  添加课程资料
                </button>
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => changeView("materials")}
                >
                  <FolderKanban size={17} />
                  打开课程资料
                </button>
              </div>
            </section>
          )}
          </div>
          <div hidden={view !== "materials"}>
            <CourseMaterialsWorkspace
              course={currentCourse}
              graph={graph}
              materials={materials}
              isGenerating={isGenerating}
              onUpload={handleFileSelection}
              onRemoveMaterial={(materialId) =>
                removeMaterial(courseKey, materialId)
              }
              onOpenReview={() => changeView("review")}
              onOpenExam={() => changeView("exam")}
            />
          </div>
          <div hidden={view !== "history"}>
            <HistoryWorkspace
              courses={courses}
              currentCourseId={courseKey}
              onOpenCourse={openCourse}
            />
          </div>
          <div hidden={view !== "wrong"}>
            <WrongBookWorkspace
              courses={courses}
              currentCourseId={courseKey}
              onOpenCourse={openCourse}
            />
          </div>
          <div hidden={view !== "favorites"}>
            <FavoritesWorkspace
              courses={courses}
              currentCourseId={courseKey}
              onOpenCourse={openCourse}
            />
          </div>
          <div hidden={view !== "exam"}>
            <ExamWorkspace graph={graph} />
          </div>
          <div hidden={view !== "settings"}>
            <SettingsWorkspace onStatusChange={handleModelStatusChange} />
          </div>
        </div>
      </main>

      {activeEvidence ? (
        <div
          className="modal-backdrop"
          onMouseDown={() => setActiveEvidence(null)}
        >
          <section
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="source-modal-heading">
              <div>
                <span className="panel-kicker">SOURCE</span>
                <h2 id="source-modal-title">{activeEvidence.nodeTitle}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭资料出处"
                title="关闭"
                onClick={() => setActiveEvidence(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="source-modal-location">
              <FileStack size={15} />
              {activeEvidence.evidence.source} · 第{" "}
              {activeEvidence.evidence.page} 页
            </div>
            <div className="source-excerpt">{activeEvidence.excerpt}</div>
            <p className="source-modal-note">
              此处展示从对应资料页提取的内容，最终答案以原始文件为准。
            </p>
          </section>
        </div>
      ) : null}
      {showCourseDialog ? (
        <CourseDialog
          onClose={() => setShowCourseDialog(false)}
          onCreate={handleCreateCourse}
        />
      ) : null}
    </div>
  );
}

export default App;
