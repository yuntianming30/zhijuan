import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
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
import { demoGraph } from "./data/demoGraph";
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

type CourseKey = "oop" | "linear-algebra" | "physics";

const courseChoices: Array<{
  key: CourseKey;
  name: string;
  language: string;
  framework: string;
  color: "green" | "amber" | "blue";
}> = [
  {
    key: "oop",
    name: "面向对象程序设计",
    language: "C++",
    framework: "MFC",
    color: "green",
  },
  {
    key: "physics",
    name: "大学物理",
    language: "",
    framework: "",
    color: "amber",
  },
  {
    key: "linear-algebra",
    name: "线性代数",
    language: "",
    framework: "",
    color: "blue",
  },
];

function graphStorageKey(courseKey: CourseKey) {
  return `stem-review-workbench:last-graph:${courseKey}`;
}

function loadStoredGraph(courseKey: CourseKey): DemoKnowledgeGraph | null {
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

function App() {
  const [view, setView] = useState<"review" | "exam" | "settings">("review");
  const [courseKey, setCourseKey] = useState<CourseKey>("oop");
  const [depth, setDepth] = useState<ReviewDepth>("focused");
  const [selectedId, setSelectedId] = useState("constructor");
  const [graph, setGraph] = useState<DemoKnowledgeGraph>(
    () => loadStoredGraph("oop") ?? demoGraph,
  );
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
      setSelectedId(visibleNodes[0]?.id ?? graph.nodes[0].id);
    }
  }, [graph.nodes, selectedId, visibleNodes]);

  const selectedNode =
    graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];

  async function generateKnowledge(files?: File[]) {
    if (isGenerating) return;
    setIsGenerating(true);
    setNotice(null);
    const form = new FormData();
    form.append("course_name", graph.course);
    form.append("language", graph.language);
    form.append("framework", graph.framework);
    form.append("depth", depth);
    form.append("sample_course", courseKey);
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
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "生成失败，请检查本地 API 和模型配置。",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files?.length) return;
    void generateKnowledge(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function switchCourse(targetKey: CourseKey) {
    if (targetKey === courseKey || isGenerating) return;
    const target = courseChoices.find((course) => course.key === targetKey);
    if (!target || !isCourseAvailable(targetKey)) {
      setNotice({
        tone: "info",
        text: `${target?.name ?? "该课程"}的本地样例将在下一轮验证中接入。`,
      });
      return;
    }

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
      setNotice({
        tone: "success",
        text: `已切换到${stored.course}。`,
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
    form.append("sample_course", targetKey);
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
      window.localStorage.setItem(
        graphStorageKey(targetKey),
        JSON.stringify(payload.graph),
      );
      setNotice({
        tone: "success",
        text: `${target.name}知识图谱已生成，可以开始复习或创建模拟考试。`,
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

  function isCourseAvailable(targetKey: CourseKey) {
    return targetKey === "oop" || sampleAvailability[targetKey] === true;
  }

  const modelLabel =
    apiState === "connected"
      ? "DeepSeek V4"
      : apiState === "checking"
        ? "检查模型"
        : "本地演示";

  function changeView(nextView: "review" | "exam" | "settings") {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            const isAvailable = item.id === "review" || item.id === "exam";
            const isActive = isAvailable && view === item.id;
            return (
              <button
                key={item.label}
                type="button"
                className={`nav-item ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                disabled={!isAvailable}
                title={isAvailable ? item.label : `${item.label}将在后续版本接入`}
                onClick={() => {
                  if (item.id === "review" || item.id === "exam") {
                    changeView(item.id);
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <div className="section-label">最近课程</div>
          {courseChoices.map((course) => {
            const available = isCourseAvailable(course.key);
            return (
              <button
                key={course.key}
                type="button"
                className={`course-chip ${
                  course.key === courseKey ? "is-current" : ""
                }`}
                disabled={!available || isGenerating}
                onClick={() => void switchCourse(course.key)}
              >
                <span className={`course-dot ${course.color}`} />
                <span>
                  <strong>{course.name}</strong>
                  <small>
                    {available
                      ? course.key === courseKey
                        ? "当前课程"
                        : "点击加载"
                      : "样例待接入"}
                  </small>
                </span>
              </button>
            );
          })}
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
            <span>{graph.course}</span>
            <ChevronRight size={14} />
            <strong>
              {view === "review"
                ? "复习导图"
                : view === "exam"
                  ? "模拟考试"
                  : "设置"}
            </strong>
          </div>
          <div className="topbar-actions">
            <select
              className="course-select"
              aria-label="切换课程"
              value={courseKey}
              disabled={isGenerating}
              onChange={(event) =>
                void switchCourse(event.target.value as CourseKey)
              }
            >
              {courseChoices.map((course) => (
                <option
                  key={course.key}
                  value={course.key}
                  disabled={!isCourseAvailable(course.key)}
                >
                  {course.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`model-pill ${apiState === "local" ? "is-local" : ""}`}
              title={
                apiState === "connected"
                  ? "DeepSeek V4 文本与视觉模型已配置"
                  : "当前使用本地演示数据"
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
          <div hidden={view !== "review"}>
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
    </div>
  );
}

export default App;
