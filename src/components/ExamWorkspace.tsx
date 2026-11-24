import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Flag,
  FileImage,
  History,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import type {
  DemoKnowledgeGraph,
  ExamAttempt,
  ExamBlueprint,
  ExamPaper,
  ExamProfile,
  ExamQuestion,
  ExamSection,
} from "../types";
import MarkdownContent from "./MarkdownContent";
import {
  archivePaper,
  loadExamHistory,
  loadFavorites,
  loadPaperArchive,
  loadWrongBook,
  saveExamHistory,
  saveWrongBook,
  toggleFavorite,
} from "../data/localStore";

interface ExamWorkspaceProps {
  graph: DemoKnowledgeGraph;
}

type ExamPhase = "blueprint" | "preview" | "exam" | "result";

const PAPER_STORAGE_KEY = "stem-review-workbench:last-paper";

const typeLabels: Record<ExamQuestion["questionType"], string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  calculation: "计算题",
  proof: "证明题",
  experiment: "实验分析题",
  code_reading: "代码阅读题",
  code_completion: "代码补全题",
  code_design: "程序设计题",
};

function defaultBlueprint(course: string): ExamBlueprint {
  const sections: ExamSection[] = [
    {
      id: "single-choice",
      title: "单项选择题",
      questionType: "single_choice",
      questionCount: 10,
      pointsPerQuestion: 2,
      sectionScore: 20,
    },
    {
      id: "code-reading",
      title: "代码阅读题",
      questionType: "code_reading",
      questionCount: 4,
      pointsPerQuestion: 10,
      sectionScore: 40,
    },
    {
      id: "code-design",
      title: "程序设计题",
      questionType: "code_design",
      questionCount: 2,
      pointsPerQuestion: 20,
      sectionScore: 40,
    },
  ];
  return {
    title: `${course}模拟期末试卷`,
    durationMinutes: 90,
    totalScore: 100,
    sections,
    difficultyRatio: { basic: 60, integrated: 30, advanced: 10 },
  };
}

function loadStoredPaper(course: string): ExamPaper | null {
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExamPaper>;
    if (
      parsed.course === course &&
      Array.isArray(parsed.sections) &&
      Array.isArray(parsed.questions) &&
      parsed.questions.length > 0
    ) {
      return parsed as ExamPaper;
    }
  } catch {
    // Ignore malformed local paper state.
  }
  return (
    Object.values(loadPaperArchive())
      .filter((paper) => paper.course === course)
      .sort(
        (first, second) =>
          new Date(second.generatedAt).getTime() -
          new Date(first.generatedAt).getTime(),
      )[0] ?? null
  );
}

function choiceKey(option: string, index: number) {
  return option.match(/^([A-Z])[.、\s]/)?.[1] ?? String.fromCharCode(65 + index);
}

function normalizeChoice(value: string | undefined) {
  if (!value) return "";
  const match = value.trim().match(/^([A-Z])/i);
  return match?.[1].toUpperCase() ?? value.trim();
}

function normalizeTextAnswer(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function isObjective(question: ExamQuestion) {
  return [
    "single_choice",
    "multiple_choice",
    "true_false",
    "fill_blank",
  ].includes(question.questionType);
}

function answerMatches(question: ExamQuestion, answer: string) {
  if (question.questionType === "fill_blank") {
    return normalizeTextAnswer(answer) === normalizeTextAnswer(question.answer);
  }
  return normalizeChoice(answer) === normalizeChoice(question.answer);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function ExamWorkspace({ graph }: ExamWorkspaceProps) {
  const [phase, setPhase] = useState<ExamPhase>(() =>
    loadStoredPaper(graph.course) ? "preview" : "blueprint",
  );
  const [blueprint, setBlueprint] = useState<ExamBlueprint>(() =>
    defaultBlueprint(graph.course),
  );
  const [focus, setFocus] = useState(
    "优先覆盖核心概念、代码阅读和 MFC 消息处理，避免照搬原题。",
  );
  const [profile, setProfile] = useState<ExamProfile | null>(null);
  const [isAnalyzingProfile, setIsAnalyzingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [paper, setPaper] = useState<ExamPaper | null>(() =>
    loadStoredPaper(graph.course),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(90 * 60);
  const [result, setResult] = useState<ExamAttempt | null>(null);
  const [rubricChecks, setRubricChecks] = useState<Record<string, number[]>>(
    {},
  );
  const [history, setHistory] = useState<ExamAttempt[]>(loadExamHistory);
  const [wrongBook, setWrongBook] = useState<string[]>(loadWrongBook);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () =>
      new Set(
        loadFavorites()
          .filter((favorite) => favorite.course === graph.course)
          .map((favorite) => favorite.question.id),
      ),
  );
  const startedAtRef = useRef<number | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBlueprint((current) => ({
      ...current,
      title: `${graph.course}模拟期末试卷`,
    }));
    const storedPaper = loadStoredPaper(graph.course);
    setPaper(storedPaper);
    setPhase(storedPaper ? "preview" : "blueprint");
    setAnswers({});
    setFlagged(new Set());
    setCurrentQuestionIndex(0);
    setResult(null);
    setRubricChecks({});
    setHistory(loadExamHistory());
    setWrongBook(loadWrongBook());
    setFavoriteIds(
      new Set(
        loadFavorites()
          .filter((favorite) => favorite.course === graph.course)
          .map((favorite) => favorite.question.id),
      ),
    );
  }, [graph.course]);

  useEffect(() => {
    if (phase !== "exam" || remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, remainingSeconds]);

  useEffect(() => {
    if (phase === "exam" && remainingSeconds === 0) {
      submitExam(true);
    }
  }, [phase, remainingSeconds]);

  const computedScore = blueprint.sections.reduce(
    (sum, section) => sum + section.sectionScore,
    0,
  );
  const sectionsValid = blueprint.sections.every((section) => {
    if (section.scoringGroups?.length) {
      const groupCount = section.scoringGroups.reduce(
        (sum, group) => sum + group.questionCount,
        0,
      );
      const groupScore = section.scoringGroups.reduce(
        (sum, group) => sum + group.groupScore,
        0,
      );
      return (
        groupCount === section.questionCount &&
        groupScore === section.sectionScore &&
        section.scoringGroups.every(
          (group) =>
            group.questionCount * group.pointsPerQuestion === group.groupScore,
        )
      );
    }
    return (
      (section.pointsPerQuestion ?? 0) * section.questionCount ===
      section.sectionScore
    );
  });
  const blueprintValid =
    sectionsValid &&
    computedScore === blueprint.totalScore &&
    blueprint.difficultyRatio.basic +
      blueprint.difficultyRatio.integrated +
      blueprint.difficultyRatio.advanced ===
      100;
  const answeredCount = paper
    ? paper.questions.filter((question) =>
        Boolean(answers[question.id]?.trim()),
      ).length
    : 0;
  const currentQuestion = paper?.questions[currentQuestionIndex];
  const questionNodeMap = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  function updateSection(
    sectionId: string,
    field: "questionCount" | "pointsPerQuestion",
    value: number,
  ) {
    setBlueprint((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const next = {
          ...section,
          [field]: Math.max(1, value || 1),
        };
        if (field === "questionCount" && next.scoringGroups?.length) {
          const scaledGroups = next.scoringGroups.map((group, index) => ({
            ...group,
            questionCount:
              index === 0
                ? Math.max(
                    1,
                    next.questionCount -
                      next.scoringGroups!
                        .slice(1)
                        .reduce((sum, item) => sum + item.questionCount, 0),
                  )
                : group.questionCount,
          }));
          return {
            ...next,
            scoringGroups: scaledGroups,
            sectionScore: scaledGroups.reduce(
              (sum, group) => sum + group.groupScore,
              0,
            ),
          };
        }
        return {
          ...next,
          sectionScore:
            next.questionCount * (next.pointsPerQuestion ?? 0),
        };
      }),
    }));
  }

  function updateScoringGroup(
    sectionId: string,
    groupIndex: number,
    field: "questionCount" | "pointsPerQuestion",
    value: number,
  ) {
    setBlueprint((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId || !section.scoringGroups) return section;
        const groups = section.scoringGroups.map((group, index) => {
          if (index !== groupIndex) return group;
          const nextCount =
            field === "questionCount"
              ? Math.max(1, value || 1)
              : group.questionCount;
          const nextPoints =
            field === "pointsPerQuestion"
              ? Math.max(1, value || 1)
              : group.pointsPerQuestion;
          return {
            questionCount: nextCount,
            pointsPerQuestion: nextPoints,
            groupScore: nextCount * nextPoints,
          };
        });
        return {
          ...section,
          questionCount: groups.reduce(
            (sum, group) => sum + group.questionCount,
            0,
          ),
          sectionScore: groups.reduce(
            (sum, group) => sum + group.groupScore,
            0,
          ),
          scoringGroups: groups,
        };
      }),
    }));
  }

  async function analyzeProfile(files: FileList | null) {
    if (!files?.length || isAnalyzingProfile) return;
    setIsAnalyzingProfile(true);
    setProfileError(null);
    const form = new FormData();
    form.append("course_name", graph.course);
    for (const file of Array.from(files)) {
      form.append("images", file);
    }
    try {
      const response = await fetch("/api/exam/profile", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as
        | { profile?: ExamProfile; detail?: string }
        | null;
      if (!response.ok || !payload?.profile) {
        throw new Error(payload?.detail ?? `识别失败（HTTP ${response.status}）`);
      }
      setProfile(payload.profile);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "真题命题结构识别失败",
      );
    } finally {
      setIsAnalyzingProfile(false);
      if (profileInputRef.current) profileInputRef.current.value = "";
    }
  }

  function applyProfileToBlueprint() {
    if (!profile) return;
    const difficulty = profile.difficultyDistribution;
    const profileSections: ExamSection[] = profile.sections.map(
      (section, index) => {
        const hasVariableGroups =
          section.scoringGroups.length > 1 ||
          (section.scoringGroups.length === 1 &&
            section.scoringGroups[0].questionCount !== section.questionCount);
        return {
          id: `profile-section-${Date.now()}-${index}`,
          title: section.title,
          questionType: section.questionType,
          questionCount: section.questionCount,
          pointsPerQuestion: hasVariableGroups
            ? undefined
            : section.pointsPerQuestion ??
              section.scoringGroups[0]?.pointsPerQuestion,
          sectionScore: section.sectionScore,
          scoringGroups: hasVariableGroups
            ? section.scoringGroups
            : undefined,
        };
      },
    );
    setBlueprint((current) => ({
      ...current,
      title: `${graph.course}真题结构模拟卷`,
      totalScore: profile.totalScore,
      durationMinutes: profile.durationMinutes ?? current.durationMinutes,
      sections: profileSections,
      difficultyRatio:
        difficulty &&
        typeof difficulty.basic === "number" &&
        typeof difficulty.integrated === "number" &&
        typeof difficulty.advanced === "number" &&
        difficulty.basic + difficulty.integrated + difficulty.advanced === 100
          ? {
              basic: difficulty.basic,
              integrated: difficulty.integrated,
              advanced: difficulty.advanced,
            }
          : current.difficultyRatio,
    }));
    setProfile(null);
  }

  async function generateExam() {
    if (!blueprintValid || isGenerating || graph.nodes.length === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/exam/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: graph.course,
          language: graph.language,
          framework: graph.framework,
          focus,
          blueprint,
          knowledge: {
            summary: graph.summary,
            nodes: graph.nodes,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { paper?: ExamPaper; detail?: string }
        | null;
      if (!response.ok || !payload?.paper) {
        throw new Error(payload?.detail ?? `生成失败（HTTP ${response.status}）`);
      }
      setPaper(payload.paper);
      archivePaper(payload.paper);
      window.localStorage.setItem(
        PAPER_STORAGE_KEY,
        JSON.stringify(payload.paper),
      );
      setAnswers({});
      setFlagged(new Set());
      setCurrentQuestionIndex(0);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "模拟试卷生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  function beginExam() {
    if (!paper) return;
    setAnswers({});
    setFlagged(new Set());
    setCurrentQuestionIndex(0);
    setRemainingSeconds(paper.durationMinutes * 60);
    startedAtRef.current = Date.now();
    setPhase("exam");
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleFlag(questionId: string) {
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function submitExam(autoSubmitted = false) {
    if (!paper || result) return;
    const unanswered = paper.questions.filter(
      (question) => !answers[question.id]?.trim(),
    ).length;
    if (
      !autoSubmitted &&
      unanswered > 0 &&
      !window.confirm(`还有 ${unanswered} 题未作答，确认交卷吗？`)
    ) {
      return;
    }

    const objectiveScores: Record<string, number> = {};
    const wrongQuestionIds: string[] = [];
    let objectiveScore = 0;
    for (const question of paper.questions) {
      if (!isObjective(question)) continue;
      if (answerMatches(question, answers[question.id] ?? "")) {
        objectiveScores[question.id] = question.points;
        objectiveScore += question.points;
      } else {
        objectiveScores[question.id] = 0;
        wrongQuestionIds.push(question.id);
      }
    }

    const attempt: ExamAttempt = {
      paperId: paper.id,
      course: paper.course,
      title: paper.title,
      submittedAt: new Date().toISOString(),
      durationSeconds: startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : paper.durationMinutes * 60 - remainingSeconds,
      maxScore: paper.totalScore,
      objectiveScore,
      selfScore: 0,
      answers,
      rubricChecks: {},
      wrongQuestionIds,
    };
    const nextHistory = [attempt, ...history].slice(0, 10);
    const nextWrongBook = Array.from(
      new Set([...wrongBook, ...wrongQuestionIds]),
    );
    setResult(attempt);
    setHistory(nextHistory);
    setWrongBook(nextWrongBook);
    setRubricChecks({});
    setPhase("result");
    saveExamHistory(nextHistory);
    saveWrongBook(nextWrongBook);
  }

  function toggleRubric(question: ExamQuestion, rubricIndex: number) {
    if (!paper || !result) return;
    const current = rubricChecks[question.id] ?? [];
    const nextForQuestion = current.includes(rubricIndex)
      ? current.filter((item) => item !== rubricIndex)
      : [...current, rubricIndex];
    const nextRubricChecks = {
      ...rubricChecks,
      [question.id]: nextForQuestion,
    };
    setRubricChecks(nextRubricChecks);

    let selfScore = 0;
    for (const item of paper.questions) {
      if (isObjective(item)) continue;
      const checked = nextRubricChecks[item.id]?.length ?? 0;
      if (item.rubric.length > 0) {
        selfScore += (item.points * checked) / item.rubric.length;
      }
    }
    const subjectiveWrong = paper.questions
      .filter((item) => !isObjective(item))
      .filter((item) => {
        const checked = nextRubricChecks[item.id]?.length ?? 0;
        return item.rubric.length === 0 || checked / item.rubric.length < 0.6;
      })
      .map((item) => item.id);
    const wrongIds = Array.from(
      new Set([...result.wrongQuestionIds, ...subjectiveWrong]),
    );
    const updated: ExamAttempt = {
      ...result,
      selfScore,
      rubricChecks: nextRubricChecks,
      wrongQuestionIds: wrongIds,
    };
    setResult(updated);
    const nextHistory = [
      updated,
      ...history.filter((item) => item.paperId !== updated.paperId),
    ].slice(0, 10);
    const nextWrongBook = Array.from(new Set([...wrongBook, ...wrongIds]));
    setHistory(nextHistory);
    setWrongBook(nextWrongBook);
    saveExamHistory(nextHistory);
    saveWrongBook(nextWrongBook);
  }

  function toggleQuestionFavorite(question: ExamQuestion) {
    if (!paper) return;
    const added = toggleFavorite(graph.course, paper.title, question);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (added) next.add(question.id);
      else next.delete(question.id);
      return next;
    });
  }

  function resetExamFlow() {
    setPaper(null);
    setResult(null);
    setAnswers({});
    setRubricChecks({});
    setError(null);
    setPhase("blueprint");
  }

  function totalResultScore() {
    return (result?.objectiveScore ?? 0) + (result?.selfScore ?? 0);
  }

  function weakKnowledgeTitles() {
    if (!paper || !result) return [];
    const weakIds = new Set<string>();
    for (const question of paper.questions) {
      if (!result.wrongQuestionIds.includes(question.id)) continue;
      for (const nodeId of question.knowledgeNodeIds) weakIds.add(nodeId);
    }
    return Array.from(weakIds)
      .map((nodeId) => questionNodeMap.get(nodeId)?.title)
      .filter((title): title is string => Boolean(title));
  }

  if (phase === "blueprint") {
    return (
      <div className="exam-workspace">
        <section className="exam-heading">
          <div>
            <div className="eyebrow">
              <ClipboardList size={15} />
              模拟考试
            </div>
            <h1>先定考卷结构，再开始出题。</h1>
            <p>
              分值、题型和知识点由你控制。生成后先预览试卷，再进入计时作答。
            </p>
          </div>
          <div className="exam-readiness">
            <ShieldCheck size={19} />
            <div>
                <strong>
                  {graph.nodes.length ? "由知识图谱出题" : "请先添加课程资料"}
                </strong>
                <span>
                  {graph.nodes.length
                    ? `${graph.nodes.length} 个可引用知识点`
                    : "生成知识导图后才能创建试卷"}
                </span>
            </div>
          </div>
        </section>

        {error ? (
          <div className="generation-notice error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button
              type="button"
              className="notice-close"
              onClick={() => setError(null)}
              aria-label="关闭错误提示"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className="exam-blueprint-layout">
          <section className="blueprint-panel">
            <div className="exam-panel-heading">
              <div>
                <span className="panel-kicker">EXAM BLUEPRINT</span>
                <h2>考试蓝图</h2>
              </div>
              <span className={`validation-chip ${blueprintValid ? "valid" : ""}`}>
                {blueprintValid ? <Check size={14} /> : <AlertTriangle size={14} />}
                {computedScore} / {blueprint.totalScore} 分
              </span>
            </div>

            <div className="blueprint-meta">
              <label className="field">
                <span>试卷名称</span>
                <input
                  value={blueprint.title}
                  onChange={(event) =>
                    setBlueprint((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field compact-field">
                <span>时长</span>
                <div className="input-with-unit">
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={blueprint.durationMinutes}
                    onChange={(event) =>
                      setBlueprint((current) => ({
                        ...current,
                        durationMinutes: Number(event.target.value) || 10,
                      }))
                    }
                  />
                  <em>分钟</em>
                </div>
              </label>
              <label className="field compact-field">
                <span>总分</span>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={blueprint.totalScore}
                  onChange={(event) =>
                    setBlueprint((current) => ({
                      ...current,
                      totalScore: Number(event.target.value) || 10,
                    }))
                  }
                />
              </label>
            </div>

            <div className="section-table" role="group" aria-label="题型分区">
              <div className="section-row section-row-head">
                <span>题型</span>
                <span>题量</span>
                <span>每题分值</span>
                <span>小计</span>
              </div>
              {blueprint.sections.map((section) => (
                <div className="section-block" key={section.id}>
                  <div className="section-row">
                    <div className="section-name">
                      <strong>{section.title}</strong>
                      <small>{typeLabels[section.questionType]}</small>
                    </div>
                    {section.scoringGroups?.length ? (
                      <span className="derived-value">
                        {section.questionCount} 题
                      </span>
                    ) : (
                      <input
                        aria-label={`${section.title}题量`}
                        type="number"
                        min={1}
                        value={section.questionCount}
                        onChange={(event) =>
                          updateSection(
                            section.id,
                            "questionCount",
                            Number(event.target.value),
                          )
                        }
                      />
                    )}
                    {section.scoringGroups?.length ? (
                      <span className="derived-value">多小问</span>
                    ) : (
                      <input
                        aria-label={`${section.title}每题分值`}
                        type="number"
                        min={1}
                        value={section.pointsPerQuestion ?? 0}
                        onChange={(event) =>
                          updateSection(
                            section.id,
                            "pointsPerQuestion",
                            Number(event.target.value),
                          )
                        }
                      />
                    )}
                    <strong className="section-score">
                      {section.sectionScore} 分
                    </strong>
                  </div>
                  {section.scoringGroups?.length ? (
                    <div className="scoring-groups">
                      {section.scoringGroups.map((group, groupIndex) => (
                        <div
                          className="scoring-group-row"
                          key={`${section.id}-group-${groupIndex}`}
                        >
                          <span>小问 {groupIndex + 1}</span>
                          <input
                            aria-label={`${section.title}小问 ${groupIndex + 1}题量`}
                            type="number"
                            min={1}
                            value={group.questionCount}
                            onChange={(event) =>
                              updateScoringGroup(
                                section.id,
                                groupIndex,
                                "questionCount",
                                Number(event.target.value),
                              )
                            }
                          />
                          <input
                            aria-label={`${section.title}小问 ${groupIndex + 1}分值`}
                            type="number"
                            min={1}
                            value={group.pointsPerQuestion}
                            onChange={(event) =>
                              updateScoringGroup(
                                section.id,
                                groupIndex,
                                "pointsPerQuestion",
                                Number(event.target.value),
                              )
                            }
                          />
                          <strong>{group.groupScore} 分</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="difficulty-row">
              <div>
                <span>难度构成</span>
                <small>基础 / 综合 / 拔高</small>
              </div>
              {(
                [
                  ["basic", "基础"],
                  ["integrated", "综合"],
                  ["advanced", "拔高"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="difficulty-field">
                  <span>{label}</span>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={blueprint.difficultyRatio[key]}
                      onChange={(event) =>
                        setBlueprint((current) => ({
                          ...current,
                          difficultyRatio: {
                            ...current.difficultyRatio,
                            [key]: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                    <em>%</em>
                  </div>
                </label>
              ))}
            </div>

            <label className="field focus-field">
              <span>额外要求</span>
              <textarea
                rows={3}
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="例如：多考消息处理、代码阅读题不要依赖未给出的类"
              />
            </label>

            <div className="blueprint-actions">
              <span>
                {blueprintValid
                  ? "蓝图校验通过，题型和分值将被严格约束。"
                  : "请调整题型分值，使其等于试卷总分，并确保难度合计为 100%。"}
              </span>
              <button
                type="button"
                className="button primary-button"
                disabled={
                  !blueprintValid || isGenerating || graph.nodes.length === 0
                }
                onClick={() => void generateExam()}
              >
                {isGenerating ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {isGenerating ? "正在出卷…" : "生成模拟试卷"}
              </button>
            </div>
          </section>

          <aside className="exam-side">
            <section className="exam-side-panel profile-import-panel">
              <div className="exam-side-title">
                <FileImage size={17} />
                <h2>参考历年真题</h2>
              </div>
              <p>
                上传真题图片，提取题型、分值和小问结构后，再应用到当前蓝图。
              </p>
              <input
                ref={profileInputRef}
                className="visually-hidden"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp"
                onChange={(event) => void analyzeProfile(event.target.files)}
              />
              <button
                type="button"
                className="button secondary-button profile-upload-button"
                disabled={isAnalyzingProfile}
                onClick={() => profileInputRef.current?.click()}
              >
                {isAnalyzingProfile ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Upload size={16} />
                )}
                {isAnalyzingProfile ? "正在识别真题…" : "上传真题图片"}
              </button>
              {profileError ? (
                <div className="side-error" role="alert">
                  <AlertTriangle size={14} />
                  <span>{profileError}</span>
                </div>
              ) : null}
            </section>
            <section className="exam-side-panel">
              <div className="exam-side-title">
                <History size={17} />
                <h2>最近考试</h2>
              </div>
              {history.length ? (
                <div className="exam-history-list">
                  {history.slice(0, 4).map((attempt) => (
                    <div className="exam-history-item" key={attempt.submittedAt}>
                      <div>
                        <strong>{attempt.title}</strong>
                        <span>
                          {new Date(attempt.submittedAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </span>
                      </div>
                      <b>
                        {Math.round(
                          attempt.objectiveScore + attempt.selfScore,
                        )}
                        <small> / {attempt.maxScore}</small>
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="exam-empty">
                  <ClipboardList size={20} />
                  <span>还没有考试记录</span>
                </div>
              )}
            </section>
            <section className="exam-side-panel exam-note">
              <div className="exam-side-title">
                <ShieldCheck size={17} />
                <h2>本次约束</h2>
              </div>
              <ul>
                <li>使用当前 {graph.language} / {graph.framework} 语境</li>
                <li>题目必须关联知识图谱节点</li>
                <li>非选择题使用评分点自评</li>
                <li>所有数据默认保存在本地</li>
              </ul>
              <div className="wrongbook-count">
                错题本已记录 {wrongBook.length} 题
              </div>
            </section>
          </aside>
        </div>
        {profile ? (
          <div
            className="modal-backdrop"
            onMouseDown={() => setProfile(null)}
          >
            <section
              className="profile-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="profile-modal-heading">
                <div>
                  <span className="panel-kicker">EXAM PROFILE</span>
                  <h2 id="profile-modal-title">真题命题画像</h2>
                  <p>
                    已识别 {profile.sections.length} 个题区，共{" "}
                    {profile.totalScore} 分。
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭命题画像"
                  onClick={() => setProfile(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="profile-meta">
                <div>
                  <span>总分</span>
                  <strong>{profile.totalScore}</strong>
                </div>
                <div>
                  <span>考试时长</span>
                  <strong>
                    {profile.durationMinutes
                      ? `${profile.durationMinutes} 分钟`
                      : "未识别"}
                  </strong>
                </div>
              </div>
              <div className="profile-section-list">
                {profile.sections.map((section) => (
                  <div
                    className="profile-section-item"
                    key={section.id}
                    data-question-count={section.questionCount}
                    data-section-score={section.sectionScore}
                  >
                    <div>
                      <strong>{section.title}</strong>
                      <span>
                        {typeLabels[section.questionType]} · {section.questionCount} 题
                      </span>
                    </div>
                    <b>{section.sectionScore} 分</b>
                    {section.scoringGroups.length ? (
                      <div className="profile-groups">
                        {section.scoringGroups.map((group, index) => (
                          <span key={`${section.id}-${index}`}>
                            小问 {index + 1}：{group.questionCount} 题 ×{" "}
                            {group.pointsPerQuestion} 分
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {profile.topicCoverage.length ? (
                <div className="profile-topics">
                  {profile.topicCoverage.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
              ) : null}
              {profile.uncertainties.length ? (
                <div className="profile-uncertainties">
                  <AlertTriangle size={15} />
                  <div>
                    {profile.uncertainties.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="profile-modal-actions">
                <span>应用后仍可在考试蓝图中修改所有题区和分值。</span>
                <button
                  type="button"
                  className="button primary-button"
                  onClick={applyProfileToBlueprint}
                >
                  <Check size={16} />
                  应用到考试蓝图
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  if (!paper) {
    return null;
  }

  if (phase === "preview") {
    return (
      <div className="exam-workspace">
        <div className="exam-page-heading">
          <button
            type="button"
            className="button back-button"
            onClick={() => setPhase("blueprint")}
          >
            <ArrowLeft size={16} />
            返回蓝图
          </button>
          <div>
            <span className="panel-kicker">EXAM PREVIEW</span>
            <h1>{paper.title}</h1>
            <p>
              {paper.questions.length} 题 · {paper.totalScore} 分 ·{" "}
              {paper.durationMinutes} 分钟
            </p>
          </div>
          <button
            type="button"
            className="button primary-button"
            onClick={beginExam}
          >
            开始答题
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="paper-sheet">
          {paper.sections.map((section) => (
            <section className="paper-section" key={section.id}>
              <div className="paper-section-heading">
                <h2>{section.title}</h2>
                <span>
                  {section.questionCount} 题 · {section.sectionScore} 分
                </span>
              </div>
              {paper.questions
                .filter((question) => question.sectionId === section.id)
                .map((question, index) => {
                  const globalIndex = paper.questions.findIndex(
                    (item) => item.id === question.id,
                  );
                  return (
                    <article className="paper-question" key={question.id}>
                      <div className="question-number">
                        {globalIndex + 1}
                      </div>
                      <div className="question-main">
                        <div className="question-meta">
                          <span>{typeLabels[question.questionType]}</span>
                          <strong>{question.points} 分</strong>
                          <button
                            type="button"
                            className={`question-favorite ${
                              favoriteIds.has(question.id) ? "is-favorite" : ""
                            }`}
                            onClick={() => toggleQuestionFavorite(question)}
                          >
                            <Star
                              size={14}
                              fill={
                                favoriteIds.has(question.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                            {favoriteIds.has(question.id) ? "已收藏" : "收藏"}
                          </button>
                        </div>
                        <MarkdownContent>{question.stemMarkdown}</MarkdownContent>
                        {question.options.length ? (
                          <div className="paper-options">
                            {question.options.map((option, optionIndex) => (
                              <div key={`${question.id}-${optionIndex}`}>
                                <b>{choiceKey(option, optionIndex)}</b>
                                <MarkdownContent>
                                  {option.replace(/^[A-Z][.、]\s*/, "")}
                                </MarkdownContent>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="question-tags">
                          {question.knowledgeNodeIds.map((nodeId) => (
                            <span key={nodeId}>
                              {questionNodeMap.get(nodeId)?.title ?? nodeId}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
            </section>
          ))}
        </div>

        <div className="paper-footer-actions">
          <span>开始答题后将进入计时模式，答案会自动保存在当前页面。</span>
          <button
            type="button"
            className="button primary-button"
            onClick={beginExam}
          >
            开始答题
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (phase === "exam" && currentQuestion) {
    return (
      <div className="exam-workspace">
        <div className="attempt-header">
          <div>
            <span className="panel-kicker">IN PROGRESS</span>
            <h1>{paper.title}</h1>
          </div>
          <div className={`exam-clock ${remainingSeconds < 300 ? "urgent" : ""}`}>
            <Clock3 size={18} />
            <span>{formatTime(remainingSeconds)}</span>
          </div>
          <button
            type="button"
            className="button primary-button"
            onClick={() => submitExam()}
          >
            <Send size={16} />
            交卷
          </button>
        </div>

        <div className="attempt-layout">
          <aside className="question-navigator" aria-label="题号导航">
            <div className="navigator-heading">
              <span>答题进度</span>
              <strong>
                {answeredCount}/{paper.questions.length}
              </strong>
            </div>
            <div className="question-grid">
              {paper.questions.map((question, index) => {
                const answered = Boolean(answers[question.id]?.trim());
                const isFlagged = flagged.has(question.id);
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={[
                      index === currentQuestionIndex ? "current" : "",
                      answered ? "answered" : "",
                      isFlagged ? "flagged" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCurrentQuestionIndex(index)}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="navigator-legend">
              <span><i className="answered-dot" />已答</span>
              <span><i className="flagged-dot" />标记</span>
            </div>
          </aside>

          <section className="attempt-question">
            <div className="attempt-question-meta">
              <span>
                {typeLabels[currentQuestion.questionType]} · {currentQuestion.points} 分
              </span>
              <button
                type="button"
                className={`flag-button ${flagged.has(currentQuestion.id) ? "is-flagged" : ""}`}
                onClick={() => toggleFlag(currentQuestion.id)}
              >
                <Flag size={15} />
                {flagged.has(currentQuestion.id) ? "已标记" : "标记本题"}
              </button>
            </div>
            <div className="attempt-number">
              第 {currentQuestionIndex + 1} 题
            </div>
            <MarkdownContent>{currentQuestion.stemMarkdown}</MarkdownContent>

            {isObjective(currentQuestion) && currentQuestion.options.length ? (
              <div className="answer-options">
                {currentQuestion.options.map((option, optionIndex) => {
                  const key = choiceKey(option, optionIndex);
                  return (
                    <label
                      key={`${currentQuestion.id}-${key}`}
                      className={`answer-option ${
                        answers[currentQuestion.id] === key ? "is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={currentQuestion.id}
                        value={key}
                        checked={answers[currentQuestion.id] === key}
                        onChange={() => setAnswer(currentQuestion.id, key)}
                      />
                      <b>{key}</b>
                      <MarkdownContent>
                        {option.replace(/^[A-Z][.、]\s*/, "")}
                      </MarkdownContent>
                    </label>
                  );
                })}
              </div>
            ) : (
              <label className="answer-textarea">
                <span>作答内容</span>
                <textarea
                  rows={currentQuestion.questionType === "code_design" ? 10 : 6}
                  value={answers[currentQuestion.id] ?? ""}
                  onChange={(event) =>
                    setAnswer(currentQuestion.id, event.target.value)
                  }
                  placeholder="写下推导、代码或评分点对应内容"
                />
              </label>
            )}

            <div className="attempt-controls">
              <button
                type="button"
                className="button back-button"
                disabled={currentQuestionIndex === 0}
                onClick={() =>
                  setCurrentQuestionIndex((index) => Math.max(0, index - 1))
                }
              >
                <ChevronLeft size={16} />
                上一题
              </button>
              {currentQuestionIndex < paper.questions.length - 1 ? (
                <button
                  type="button"
                  className="button primary-button"
                  onClick={() =>
                    setCurrentQuestionIndex((index) =>
                      Math.min(paper.questions.length - 1, index + 1),
                    )
                  }
                >
                  下一题
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary-button"
                  onClick={() => submitExam()}
                >
                  完成并交卷
                  <Send size={16} />
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    const score = totalResultScore();
    const percentage = Math.round((score / result.maxScore) * 100);
    const weakTitles = weakKnowledgeTitles();
    return (
      <div className="exam-workspace">
        <div className="result-hero">
          <div className="result-score">
            <span>本次得分</span>
            <strong>{Math.round(score)}</strong>
            <small>/ {result.maxScore}</small>
          </div>
          <div className="result-summary">
            <div className="eyebrow">
              <Trophy size={15} />
              模拟考试复盘
            </div>
            <h1>{percentage >= 80 ? "基础比较稳固。" : "优先处理失分知识点。"}</h1>
            <p>
              客观题得分 {Math.round(result.objectiveScore)} 分，自评得分{" "}
              {Math.round(result.selfScore)} 分，用时{" "}
              {formatTime(result.durationSeconds)}。
            </p>
          </div>
          <button
            type="button"
            className="button back-button"
            onClick={resetExamFlow}
          >
            <RotateCcw size={16} />
            再考一次
          </button>
        </div>

        <div className="result-layout">
          <section className="result-main">
            <div className="result-section-heading">
              <div>
                <span className="panel-kicker">REVIEW</span>
                <h2>逐题复盘</h2>
              </div>
              <span>{paper.questions.length} 题</span>
            </div>
            {paper.questions.map((question, index) => {
              const answer = answers[question.id] ?? "";
              const objective = isObjective(question);
              const correct = answerMatches(question, answer);
              const checked = rubricChecks[question.id] ?? [];
              const ratio =
                question.rubric.length > 0
                  ? checked.length / question.rubric.length
                  : 0;
              const subjectiveScore = objective
                ? correct
                  ? question.points
                  : 0
                : question.points * ratio;
              return (
                <article className="result-question" key={question.id}>
                  <div className="result-question-title">
                    <span className="result-question-number">{index + 1}</span>
                    <div>
                      <strong>{typeLabels[question.questionType]}</strong>
                      <span>{question.points} 分</span>
                    </div>
                    <span
                      className={`result-state ${
                        objective
                          ? correct
                            ? "correct"
                            : "wrong"
                          : ratio >= 0.6
                            ? "correct"
                            : "partial"
                      }`}
                    >
                      {objective
                        ? correct
                          ? "正确"
                          : "错误"
                        : `${Math.round(subjectiveScore)} / ${question.points} 分`}
                    </span>
                    <button
                      type="button"
                      className={`question-favorite ${
                        favoriteIds.has(question.id) ? "is-favorite" : ""
                      }`}
                      onClick={() => toggleQuestionFavorite(question)}
                    >
                      <Star
                        size={14}
                        fill={
                          favoriteIds.has(question.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                      {favoriteIds.has(question.id) ? "已收藏" : "收藏"}
                    </button>
                  </div>
                  <MarkdownContent>{question.stemMarkdown}</MarkdownContent>
                  <div className="answer-comparison">
                    <div>
                      <span>你的答案</span>
                      <MarkdownContent>{answer || "未作答"}</MarkdownContent>
                    </div>
                    <div>
                      <span>参考答案</span>
                      <MarkdownContent>
                        {question.answer || "按评分点自评"}
                      </MarkdownContent>
                    </div>
                  </div>
                  <div className="explanation-box">
                    <span>解析</span>
                    <MarkdownContent>{question.explanationMarkdown}</MarkdownContent>
                  </div>
                  {!objective && question.rubric.length ? (
                    <div className="rubric-box">
                      <span>按实际作答勾选得分点</span>
                      {question.rubric.map((rubric, rubricIndex) => (
                        <label key={`${question.id}-${rubricIndex}`}>
                          <input
                            type="checkbox"
                            checked={checked.includes(rubricIndex)}
                            onChange={() =>
                              toggleRubric(question, rubricIndex)
                            }
                          />
                          <span>{rubric}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

          <aside className="result-side">
            <section className="result-side-panel">
              <div className="exam-side-title">
                <BookOpenCheck size={17} />
                <h2>薄弱知识点</h2>
              </div>
              {weakTitles.length ? (
                <div className="weak-list">
                  {weakTitles.map((title) => (
                    <span key={title}>{title}</span>
                  ))}
                </div>
              ) : (
                <div className="exam-empty">
                  <CheckCircle2 size={20} />
                  <span>当前没有薄弱知识点</span>
                </div>
              )}
            </section>
            <section className="result-side-panel">
              <div className="exam-side-title">
                <ListChecks size={17} />
                <h2>下一步</h2>
              </div>
              <ul className="next-step-list">
                <li>回到知识导图，优先复习薄弱节点。</li>
                <li>重新自评未勾满的程序设计题。</li>
                <li>错题已保存到本地错题本。</li>
              </ul>
            </section>
            <section className="result-side-panel result-note">
              <Timer size={17} />
              <span>本次用时 {formatTime(result.durationSeconds)}</span>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return null;
}
