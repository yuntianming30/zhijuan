import type { ExamAttempt, ExamPaper, ExamQuestion } from "../types";

export type CourseAccent = "green" | "amber" | "blue" | "rose" | "cyan";

export interface CourseDefinition {
  id: string;
  name: string;
  description: string;
  language: string;
  framework: string;
  accent: CourseAccent;
  builtIn: boolean;
  sampleCourse?: "oop" | "linear-algebra" | "physics";
  createdAt: string;
}

export interface CourseMaterial {
  id: string;
  courseId: string;
  name: string;
  size: number;
  kind: string;
  addedAt: string;
}

export interface StudyHistoryEntry {
  id: string;
  courseId: string;
  course: string;
  kind: "graph" | "exam" | "course" | "materials";
  title: string;
  detail: string;
  occurredAt: string;
  score?: number;
  maxScore?: number;
}

export interface FavoriteQuestion {
  id: string;
  course: string;
  paperTitle: string;
  question: ExamQuestion;
  addedAt: string;
}

export interface NewCourseInput {
  name: string;
  description: string;
  language: string;
  framework: string;
  accent: CourseAccent;
}

const COURSES_KEY = "stem-review-workbench:courses:v1";
const ACTIVE_COURSE_KEY = "stem-review-workbench:active-course";
const MATERIALS_KEY = "stem-review-workbench:materials:v1";
const STUDY_HISTORY_KEY = "stem-review-workbench:study-history:v1";
const PAPER_ARCHIVE_KEY = "stem-review-workbench:paper-archive:v1";
const FAVORITES_KEY = "stem-review-workbench:favorites:v1";
export const EXAM_HISTORY_KEY = "stem-review-workbench:exam-history";
export const WRONG_BOOK_KEY = "stem-review-workbench:wrong-book";
export const DATA_CHANGED_EVENT = "zhijuan:data-changed";

export const defaultCourses: CourseDefinition[] = [
  {
    id: "oop",
    name: "面向对象程序设计",
    description: "以 C++ 与 MFC 语境复习类、对象、消息响应和组件使用。",
    language: "C++",
    framework: "MFC",
    accent: "green",
    builtIn: true,
    sampleCourse: "oop",
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "physics",
    name: "大学物理",
    description: "覆盖公式推导、物理过程和实验分析类考点。",
    language: "不适用",
    framework: "无",
    accent: "amber",
    builtIn: true,
    sampleCourse: "physics",
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "linear-algebra",
    name: "线性代数",
    description: "覆盖矩阵、向量组、线性方程组和公式计算。",
    language: "不适用",
    framework: "无",
    accent: "blue",
    builtIn: true,
    sampleCourse: "linear-algebra",
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function notifyDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
}

export function loadCourses(): CourseDefinition[] {
  const saved = readJson<CourseDefinition[]>(COURSES_KEY, []);
  const custom = Array.isArray(saved)
    ? saved.filter(
        (course) =>
          course &&
          typeof course.id === "string" &&
          typeof course.name === "string" &&
          !defaultCourses.some((item) => item.id === course.id),
      )
    : [];
  return [...defaultCourses, ...custom];
}

export function createCourse(input: NewCourseInput): CourseDefinition {
  const courses = loadCourses();
  const accent = input.accent;
  const course: CourseDefinition = {
    id: `course-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    language: input.language.trim() || "不适用",
    framework: input.framework.trim() || "无",
    accent,
    builtIn: false,
    createdAt: new Date().toISOString(),
  };
  writeJson(COURSES_KEY, [...courses, course]);
  notifyDataChanged();
  return course;
}

export function loadActiveCourseId() {
  return canUseStorage() ? window.localStorage.getItem(ACTIVE_COURSE_KEY) : null;
}

export function saveActiveCourseId(courseId: string) {
  if (canUseStorage()) {
    window.localStorage.setItem(ACTIVE_COURSE_KEY, courseId);
  }
}

export function loadMaterials(courseId?: string): CourseMaterial[] {
  const saved = readJson<CourseMaterial[]>(MATERIALS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return courseId ? saved.filter((item) => item.courseId === courseId) : saved;
}

export function addMaterials(
  courseId: string,
  files: File[],
): CourseMaterial[] {
  const current = loadMaterials();
  const added = files.map((file, index) => ({
    id: `material-${Date.now().toString(36)}-${index}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    courseId,
    name: file.name,
    size: file.size,
    kind: file.name.split(".").pop()?.toUpperCase() || "文件",
    addedAt: new Date().toISOString(),
  }));
  writeJson(MATERIALS_KEY, [...current, ...added]);
  notifyDataChanged();
  return added;
}

export function removeMaterial(courseId: string, materialId: string) {
  const next = loadMaterials().filter(
    (item) => !(item.courseId === courseId && item.id === materialId),
  );
  writeJson(MATERIALS_KEY, next);
  notifyDataChanged();
}

export function loadStudyHistory(): StudyHistoryEntry[] {
  const history = readJson<StudyHistoryEntry[]>(STUDY_HISTORY_KEY, []);
  return Array.isArray(history) ? history : [];
}

export function recordStudyEvent(
  entry: Omit<StudyHistoryEntry, "id" | "occurredAt"> & {
    occurredAt?: string;
  },
) {
  const next: StudyHistoryEntry = {
    ...entry,
    id: `event-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
  };
  writeJson(STUDY_HISTORY_KEY, [next, ...loadStudyHistory()].slice(0, 200));
  notifyDataChanged();
}

export function loadExamHistory(): ExamAttempt[] {
  const history = readJson<ExamAttempt[]>(EXAM_HISTORY_KEY, []);
  return Array.isArray(history) ? history.slice(0, 50) : [];
}

export function saveExamHistory(history: ExamAttempt[]) {
  writeJson(EXAM_HISTORY_KEY, history.slice(0, 50));
  notifyDataChanged();
}

export function loadWrongBook(): string[] {
  const values = readJson<string[]>(WRONG_BOOK_KEY, []);
  return Array.isArray(values) ? values : [];
}

export function saveWrongBook(questionIds: string[]) {
  writeJson(WRONG_BOOK_KEY, Array.from(new Set(questionIds)));
  notifyDataChanged();
}

export function archivePaper(paper: ExamPaper) {
  const archive = readJson<Record<string, ExamPaper>>(PAPER_ARCHIVE_KEY, {});
  const entries = [
    [paper.id, paper] as const,
    ...Object.entries(archive).filter(([id]) => id !== paper.id),
  ].slice(0, 16);
  writeJson(PAPER_ARCHIVE_KEY, Object.fromEntries(entries));
  notifyDataChanged();
}

export function loadPaperArchive(): Record<string, ExamPaper> {
  const archive = readJson<Record<string, ExamPaper>>(PAPER_ARCHIVE_KEY, {});
  return archive && typeof archive === "object" ? archive : {};
}

export function loadFavorites(): FavoriteQuestion[] {
  const favorites = readJson<FavoriteQuestion[]>(FAVORITES_KEY, []);
  return Array.isArray(favorites) ? favorites : [];
}

export function isFavorite(course: string, questionId: string) {
  return loadFavorites().some(
    (item) => item.course === course && item.question.id === questionId,
  );
}

export function toggleFavorite(
  course: string,
  paperTitle: string,
  question: ExamQuestion,
): boolean {
  const favorites = loadFavorites();
  const existing = favorites.find(
    (item) => item.course === course && item.question.id === question.id,
  );
  const next = existing
    ? favorites.filter((item) => item.id !== existing.id)
    : [
        {
          id: `favorite-${Date.now().toString(36)}`,
          course,
          paperTitle,
          question,
          addedAt: new Date().toISOString(),
        },
        ...favorites,
      ];
  writeJson(FAVORITES_KEY, next);
  notifyDataChanged();
  return !existing;
}
