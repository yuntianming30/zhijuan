import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileQuestion, Star, Trash2 } from "lucide-react";
import {
  DATA_CHANGED_EVENT,
  loadFavorites,
  toggleFavorite,
} from "../data/localStore";
import type { CourseDefinition } from "../data/localStore";
import MarkdownContent from "./MarkdownContent";

interface FavoritesWorkspaceProps {
  courses: CourseDefinition[];
  currentCourseId: string;
  onOpenCourse: (courseId: string, view: "review" | "exam") => void;
}

export default function FavoritesWorkspace({
  courses,
  currentCourseId,
  onOpenCourse,
}: FavoritesWorkspaceProps) {
  const [scope, setScope] = useState<"current" | "all">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, []);

  const rows = useMemo(() => {
    return loadFavorites().filter((favorite) => {
      if (scope === "all") return true;
      const course = courses.find((item) => item.id === currentCourseId);
      return favorite.course === course?.name;
    });
  }, [courses, currentCourseId, refreshKey, scope]);

  return (
    <div className="favorites-workspace">
      <section className="workspace-heading">
        <div>
          <div className="eyebrow">
            <Star size={15} />
            收藏题目
          </div>
          <h1>把值得再做一次的题留好。</h1>
          <p>在试卷预览或考试复盘中收藏题目，答案和解析会一起保存在本地。</p>
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

      {rows.length ? (
        <div className="favorite-grid">
          {rows.map((favorite) => {
            const course = courses.find(
              (item) => item.name === favorite.course,
            );
            return (
              <article className="favorite-question" key={favorite.id}>
                <div className="favorite-heading">
                  <div>
                    <span className="favorite-star">
                      <Star size={15} fill="currentColor" />
                    </span>
                    <div>
                      <strong>{favorite.course}</strong>
                      <span>{favorite.paperTitle}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label="取消收藏"
                    title="取消收藏"
                    onClick={() =>
                      toggleFavorite(
                        favorite.course,
                        favorite.paperTitle,
                        favorite.question,
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="favorite-meta">
                  <span>{favorite.question.points} 分</span>
                  <span>{favorite.question.gradingMode === "auto" ? "自动判分" : "评分点自评"}</span>
                </div>
                <MarkdownContent>
                  {favorite.question.stemMarkdown}
                </MarkdownContent>
                <details className="favorite-answer">
                  <summary>查看答案与解析</summary>
                  <div>
                    <span>参考答案</span>
                    <MarkdownContent>
                      {favorite.question.answer || "按评分点自评"}
                    </MarkdownContent>
                  </div>
                  <div>
                    <span>解析</span>
                    <MarkdownContent>
                      {favorite.question.explanationMarkdown}
                    </MarkdownContent>
                  </div>
                </details>
                <button
                  type="button"
                  className="favorite-open"
                  disabled={!course}
                  onClick={() => course && onOpenCourse(course.id, "exam")}
                >
                  回到课程模拟考试
                  <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="workspace-empty-state">
          <FileQuestion size={25} />
          <h2>{scope === "current" ? "当前课程还没有收藏" : "还没有收藏题目"}</h2>
          <p>打开模拟试卷预览或考试复盘，点击题目右上角的收藏按钮即可保存。</p>
        </section>
      )}
    </div>
  );
}
