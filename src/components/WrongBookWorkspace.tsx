import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Flag,
  RotateCcw,
} from "lucide-react";
import {
  DATA_CHANGED_EVENT,
  loadExamHistory,
  loadPaperArchive,
  loadWrongBook,
  saveWrongBook,
} from "../data/localStore";
import type { CourseDefinition } from "../data/localStore";
import type { ExamQuestion } from "../types";
import MarkdownContent from "./MarkdownContent";

interface WrongBookWorkspaceProps {
  courses: CourseDefinition[];
  currentCourseId: string;
  onOpenCourse: (courseId: string, view: "exam") => void;
}

type WrongRecord = {
  id: string;
  course: string;
  courseId: string;
  paperTitle: string;
  question: ExamQuestion | null;
  submittedAt: string;
};

export default function WrongBookWorkspace({
  courses,
  currentCourseId,
  onOpenCourse,
}: WrongBookWorkspaceProps) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, []);

  const records = useMemo<WrongRecord[]>(() => {
    const wrongIds = new Set(loadWrongBook());
    if (!wrongIds.size) return [];
    const archive = loadPaperArchive();
    const attempts = loadExamHistory();
    const rows: WrongRecord[] = [];
    const seen = new Set<string>();

    for (const attempt of attempts) {
      const paper = archive[attempt.paperId];
      for (const questionId of attempt.wrongQuestionIds) {
        if (!wrongIds.has(questionId) || seen.has(questionId)) continue;
        seen.add(questionId);
        const question =
          paper?.questions.find((item) => item.id === questionId) ?? null;
        rows.push({
          id: questionId,
          course: attempt.course,
          courseId:
            courses.find((course) => course.name === attempt.course)?.id ?? "",
          paperTitle: attempt.title,
          question,
          submittedAt: attempt.submittedAt,
        });
      }
    }

    for (const questionId of wrongIds) {
      if (seen.has(questionId)) continue;
      const paper = Object.values(archive).find((item) =>
        item.questions.some((question) => question.id === questionId),
      );
      const question =
        paper?.questions.find((item) => item.id === questionId) ?? null;
      rows.push({
        id: questionId,
        course: paper?.course ?? "旧版记录",
        courseId:
          courses.find((item) => item.name === paper?.course)?.id ?? "",
        paperTitle: paper?.title ?? "未归档试卷",
        question,
        submittedAt: "",
      });
    }

    return rows.filter(
      (row) => scope === "all" || row.courseId === currentCourseId,
    );
  }, [courses, currentCourseId, refreshKey, scope]);

  function markMastered(questionId: string) {
    saveWrongBook(loadWrongBook().filter((id) => id !== questionId));
  }

  return (
    <div className="wrongbook-workspace">
      <section className="workspace-heading">
        <div>
          <div className="eyebrow">
            <BookOpen size={15} />
            错题本
          </div>
          <h1>把失分原因留在这里。</h1>
          <p>错题来自已完成模拟考试；确认掌握后可以从错题本移除。</p>
        </div>
        <div className="segmented-control history-scope">
          <button
            type="button"
            className={scope === "current" ? "is-selected" : ""}
            aria-pressed={scope === "current"}
            onClick={() => setScope("current")}
          >
            当前课程
          </button>
          <button
            type="button"
            className={scope === "all" ? "is-selected" : ""}
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            全部课程
          </button>
        </div>
      </section>

      {records.length ? (
        <div className="wrong-question-list">
          {records.map((record, index) => (
            <article className="wrong-question" key={record.id}>
              <div className="wrong-question-heading">
                <div>
                  <span className="wrong-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{record.course}</strong>
                    <span>{record.paperTitle}</span>
                  </div>
                </div>
                <div className="wrong-actions">
                  <button
                    type="button"
                    className="button secondary-button"
                    disabled={!record.courseId}
                    onClick={() =>
                      record.courseId &&
                      onOpenCourse(record.courseId, "exam")
                    }
                  >
                    <RotateCcw size={15} />
                    再练一次
                  </button>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => markMastered(record.id)}
                  >
                    <CheckCircle2 size={15} />
                    已掌握
                  </button>
                </div>
              </div>

              {record.question ? (
                <>
                  <div className="wrong-question-meta">
                    <span>{record.question.points} 分</span>
                    <span>
                      {
                        {
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
                        }[record.question.questionType]
                      }
                    </span>
                  </div>
                  <MarkdownContent>
                    {record.question.stemMarkdown}
                  </MarkdownContent>
                  <div className="wrong-answer-grid">
                    <div>
                      <span>参考答案</span>
                      <MarkdownContent>
                        {record.question.answer || "按评分点自评"}
                      </MarkdownContent>
                    </div>
                    <div>
                      <span>解析</span>
                      <MarkdownContent>
                        {record.question.explanationMarkdown}
                      </MarkdownContent>
                    </div>
                  </div>
                  {record.question.rubric.length ? (
                    <div className="wrong-rubric">
                      {record.question.rubric.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="legacy-record-note">
                  <AlertTriangle size={17} />
                  <span>
                    这是旧版考试记录，只保存了题目标识。重新完成一次考试后会显示完整题目。
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="workspace-empty-state">
          <Flag size={25} />
          <h2>{scope === "current" ? "当前课程没有错题" : "还没有错题记录"}</h2>
          <p>完成模拟考试后，客观题错题和非主观评分点不足的题目会进入这里。</p>
        </section>
      )}
    </div>
  );
}
