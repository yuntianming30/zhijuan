import { useRef } from "react";
import {
  ArrowRight,
  BookOpen,
  FileStack,
  FolderOpen,
  LoaderCircle,
  Network,
  Trash2,
  Upload,
} from "lucide-react";
import type { CourseDefinition, CourseMaterial } from "../data/localStore";
import type { DemoKnowledgeGraph } from "../types";

interface CourseMaterialsWorkspaceProps {
  course: CourseDefinition;
  graph: DemoKnowledgeGraph;
  materials: CourseMaterial[];
  isGenerating: boolean;
  onUpload: (files: FileList | null) => void;
  onRemoveMaterial: (materialId: string) => void;
  onOpenReview: () => void;
  onOpenExam: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CourseMaterialsWorkspace({
  course,
  graph,
  materials,
  isGenerating,
  onUpload,
  onRemoveMaterial,
  onOpenReview,
  onOpenExam,
}: CourseMaterialsWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasGraph = graph.nodes.length > 0;

  return (
    <div className="materials-workspace">
      <section className="workspace-heading">
        <div>
          <div className="eyebrow">
            <FolderOpen size={15} />
            课程资料
          </div>
          <h1>{course.name}</h1>
          <p>
            {course.description ||
              "上传课件、复习资料或历年真题后，可以生成知识导图和模拟试卷。"}
          </p>
        </div>
        <div className="materials-course-meta">
          <span>{course.language}</span>
          <span>{course.framework}</span>
        </div>
      </section>

      <section className="materials-stats" aria-label="课程资料概况">
        <div>
          <FileStack size={18} />
          <span>
            <strong>{materials.length}</strong>
            已处理资料
          </span>
        </div>
        <div>
          <Network size={18} />
          <span>
            <strong>{graph.nodes.length}</strong>
            知识节点
          </span>
        </div>
        <div>
          <BookOpen size={18} />
          <span>
            <strong>{graph.sourceCount}</strong>
            最近生成引用资料
          </span>
        </div>
      </section>

      <section className="materials-layout">
        <div className="materials-main">
          <div className="materials-section-heading">
            <div>
              <span className="panel-kicker">SOURCE FILES</span>
              <h2>已处理资料</h2>
            </div>
            <button
              type="button"
              className="button primary-button"
              disabled={isGenerating}
              onClick={() => inputRef.current?.click()}
            >
              {isGenerating ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Upload size={16} />
              )}
              {isGenerating ? "正在解析资料…" : "添加并生成导图"}
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {materials.length ? (
            <div className="material-table">
              <div className="material-row material-row-head">
                <span>文件名</span>
                <span>类型</span>
                <span>大小</span>
                <span>处理时间</span>
                <span />
              </div>
              {[...materials].reverse().map((material) => (
                <div className="material-row" key={material.id}>
                  <div className="material-name">
                    <FileStack size={16} />
                    <strong>{material.name}</strong>
                  </div>
                  <span>{material.kind}</span>
                  <span>{formatBytes(material.size)}</span>
                  <span>{formatDate(material.addedAt)}</span>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={`移除 ${material.name} 记录`}
                    title="从列表移除；不会影响已经生成的导图"
                    onClick={() => onRemoveMaterial(material.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="materials-empty"
              disabled={isGenerating}
              onClick={() => inputRef.current?.click()}
            >
              <span className="empty-upload-icon">
                <Upload size={24} />
              </span>
              <strong>添加这门课的第一份资料</strong>
              <span>
                支持 PDF、PPTX、PNG/JPG、Markdown 和 TXT。一次最多选择 12 个文件。
              </span>
            </button>
          )}
        </div>

        <aside className="materials-side">
          <section className="materials-side-panel">
            <span className="panel-kicker">NEXT STEP</span>
            <h2>{hasGraph ? "继续复习或出卷" : "等待生成导图"}</h2>
            <p>
              {hasGraph
                ? "知识导图已经包含可引用的课程内容，可以继续进入模拟考试。"
                : "添加资料后，AI 会提取重点和来源页码，并建立课程知识关系。"}
            </p>
            {hasGraph ? (
              <div className="materials-side-actions">
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={onOpenReview}
                >
                  打开复习导图
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="button primary-button"
                  onClick={onOpenExam}
                >
                  创建模拟试卷
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : null}
          </section>

          <section className="materials-side-panel material-format-note">
            <strong>资料会保存在哪里？</strong>
            <p>
              原始文件由本地后端处理，生成结果保存在当前浏览器。不要把 API Key
              放进课件或文件名。
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}
