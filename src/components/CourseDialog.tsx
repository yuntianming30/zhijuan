import { useEffect, useRef, useState } from "react";
import { BookPlus, Check, X } from "lucide-react";
import type {
  CourseAccent,
  NewCourseInput,
} from "../data/localStore";

interface CourseDialogProps {
  onClose: () => void;
  onCreate: (course: NewCourseInput) => void;
}

const accents: Array<{ value: CourseAccent; label: string }> = [
  { value: "green", label: "青绿" },
  { value: "amber", label: "琥珀" },
  { value: "blue", label: "蓝色" },
  { value: "rose", label: "玫红" },
  { value: "cyan", label: "天青" },
];

export default function CourseDialog({
  onClose,
  onCreate,
}: CourseDialogProps) {
  const [form, setForm] = useState<NewCourseInput>({
    name: "",
    description: "",
    language: "",
    framework: "",
    accent: "green",
  });
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onCreate(form);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="course-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="course-dialog-heading">
          <div>
            <span className="panel-kicker">NEW COURSE</span>
            <h2 id="course-dialog-title">新建课程</h2>
            <p>课程创建后，后续上传的资料、导图和考试记录都会归入这里。</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭新建课程"
            title="关闭"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form className="course-dialog-form" onSubmit={submit}>
          <label className="field">
            <span>课程名称</span>
            <input
              ref={nameInputRef}
              value={form.name}
              maxLength={60}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="例如：数字电路、数据结构、工程力学"
            />
          </label>

          <label className="field">
            <span>课程说明</span>
            <textarea
              rows={3}
              maxLength={240}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="例如：重点复习组合逻辑、时序逻辑和常见计算题"
            />
          </label>

          <div className="course-dialog-grid">
            <label className="field">
              <span>语言（可选）</span>
              <input
                value={form.language}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    language: event.target.value,
                  }))
                }
                placeholder="例如：C++、Python、MATLAB"
              />
            </label>
            <label className="field">
              <span>框架或工具（可选）</span>
              <input
                value={form.framework}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    framework: event.target.value,
                  }))
                }
                placeholder="例如：MFC、Qt、Multisim"
              />
            </label>
          </div>

          <fieldset className="course-accent-field">
            <legend>课程颜色</legend>
            <div className="course-accent-options">
              {accents.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  className={form.accent === accent.value ? "is-selected" : ""}
                  aria-label={accent.label}
                  aria-pressed={form.accent === accent.value}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      accent: accent.value,
                    }))
                  }
                >
                  <i className={`course-dot ${accent.value}`} />
                  <span>{accent.label}</span>
                  {form.accent === accent.value ? <Check size={13} /> : null}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="course-dialog-actions">
            <span>资料格式支持 PDF、PPTX、图片、Markdown 和 TXT。</span>
            <button
              type="submit"
              className="button primary-button"
              disabled={!form.name.trim()}
            >
              <BookPlus size={17} />
              创建并进入课程
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
