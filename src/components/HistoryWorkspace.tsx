import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  FileStack,
  History,
  Network,
} from "lucide-react";
import {
  DATA_CHANGED_EVENT,
  loadExamHistory,
  loadStudyHistory,
} from "../data/localStore";
import type { CourseDefinition } from "../data/localStore";

interface HistoryWorkspaceProps {
  courses: CourseDefinition[];
  currentCourseId: string;
  onOpenCourse: (courseId: string, view: "review" | "exam") => void;
}

type HistoryRow = {
  id: string;
  courseId: string;
  course: string;
  title: string;
  detail: string;
  occurredAt: string;
  kind: "graph" | "exam" | "course" | "materials";
  score?: number;
  maxScore?: number;
};

function courseIdForName(courses: CourseDefinition[], name: string) {
  return courses.find((course) => course.name === name)?.id ?? "";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryWorkspace({
  courses,
  currentCourseId,
  onOpenCourse,
}: HistoryWorkspaceProps) {
  const [scope, setScope] = useState<"current" | "all">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, []);

  const rows = useMemo<HistoryRow[]>(() => {
    const events = loadStudyHistory().map((entry) => ({
      ...entry,
    }));
    const exams = loadExamHistory().map((attempt) => ({
      id: `exam-${attempt.paperId}-${attempt.submittedAt}`,
      courseId: courseIdForName(courses, attempt.course),
      course: attempt.course,
      kind: "exam" as const,
      title: attempt.title,
      detail: `${attempt.wrongQuestionIds.length} 道错题，作答用时 ${Math.max(
        1,
        Math.round(attempt.durationSeconds / 60),
      )} 分钟`,
      occurredAt: attempt.submittedAt,
      score: attempt.objectiveScore + attempt.selfScore,
      maxScore: attempt.maxScore,
    }));

    const filtered = [...events, ...exams].filter(
      (row) =>
        scope === "all" ||
        row.courseId === currentCourseId ||
        (!row.courseId && row.course ===
          courses.find((course) => course.id === currentCourseId)?.name),
    );
    return filtered.sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() -
        new Date(first.occurredAt).getTime(),
    );
  }, [courses, currentCourseId, refreshKey, scope]);

  const examCount = rows.filter((row) => row.kind === "exam").length;
  const graphCount = rows.filter((row) => row.kind === "graph").length;

  return (
    <div className="history-workspace">
      <section className="workspace-heading">
        <div>
          <div className="eyebrow">
            <History size={15} />
            历史记录
          </div>
          <h1>每一次生成和作答都有记录。</h1>
          <p>查看课程导图生成、资料处理、模拟考试和得分情况。</p>
        </div>
        <div className="segmented-control history-scope">
          <button
            type="button"
            className={scope === "all" ? "is-selected" : ""}
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            全部课程
          </button>
          <button
            type="button"
            className={scope === "current" ? "is-selected" : ""}
            aria-pressed={scope === "current"}
            onClick={() => setScope("current")}
          >
            当前课程
          </button>
        </div>
      </section>

      <section className="history-stats" aria-label="历史记录概况">
        <div>
          <CalendarClock size={18} />
          <span>
            <strong>{rows.length}</strong>
            条记录
          </span>
        </div>
        <div>
          <ClipboardCheck size={18} />
          <span>
            <strong>{examCount}</strong>
            次考试
          </span>
        </div>
        <div>
          <Network size={18} />
          <span>
            <strong>{graphCount}</strong>
            次导图生成
          </span>
        </div>
      </section>

      {rows.length ? (
        <div className="timeline-list">
          {rows.map((row) => {
            const course = courses.find((item) => item.id === row.courseId);
            const Icon =
              row.kind === "exam"
                ? BookOpenCheck
                : row.kind === "materials"
                  ? FileStack
                  : Network;
            return (
              <article className="timeline-row" key={row.id}>
                <div className={`timeline-icon ${row.kind}`}>
                  <Icon size={17} />
                </div>
                <div className="timeline-copy">
                  <div>
                    <span>{course?.name ?? row.course}</span>
                    <time>{formatDate(row.occurredAt)}</time>
                  </div>
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
                {typeof row.score === "number" ? (
                  <div className="timeline-score">
                    <strong>{Math.round(row.score)}</strong>
                    <span>/ {row.maxScore}</span>
                  </div>
                ) : course ? (
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() =>
                      onOpenCourse(
                        course.id,
                        row.kind === "exam" ? "exam" : "review",
                      )
                    }
                  >
                    打开课程
                    <ArrowRight size={15} />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="workspace-empty-state">
          <History size={25} />
          <h2>还没有历史记录</h2>
          <p>上传资料生成知识导图，或完成一次模拟考试后，记录会出现在这里。</p>
        </section>
      )}
    </div>
  );
}
