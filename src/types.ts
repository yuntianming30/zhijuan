export type Importance = "core" | "important" | "normal";
export type ReviewDepth = "quick" | "focused" | "complete";

export interface Evidence {
  source: string;
  page: number;
  excerpt?: string;
}

export interface KnowledgeNode {
  id: string;
  title: string;
  summary: string;
  type: "概念" | "方法" | "代码" | "易错点";
  importance: Importance;
  evidence: Evidence[];
  branch: string;
  reviewHint: string;
}

export interface KnowledgeBranch {
  id: string;
  title: string;
  color: string;
}

export interface DemoKnowledgeGraph {
  course: string;
  subtitle: string;
  language: string;
  framework: string;
  model: string;
  sourceCount: number;
  summary: string;
  branches: KnowledgeBranch[];
  nodes: KnowledgeNode[];
  warnings: string[];
}

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "calculation"
  | "proof"
  | "experiment"
  | "code_reading"
  | "code_completion"
  | "code_design";

export interface ExamSection {
  id: string;
  title: string;
  questionType: QuestionType;
  questionCount: number;
  pointsPerQuestion?: number;
  sectionScore: number;
  scoringGroups?: ScoringGroup[];
}

export interface ScoringGroup {
  questionCount: number;
  pointsPerQuestion: number;
  groupScore: number;
}

export interface ExamQuestion {
  id: string;
  sectionId: string;
  questionType: QuestionType;
  points: number;
  knowledgeNodeIds: string[];
  stemMarkdown: string;
  options: string[];
  answer: string;
  explanationMarkdown: string;
  rubric: string[];
  gradingMode: "auto" | "rubricSelf";
}

export interface ExamBlueprint {
  title: string;
  durationMinutes: number;
  totalScore: number;
  sections: ExamSection[];
  difficultyRatio: {
    basic: number;
    integrated: number;
    advanced: number;
  };
}

export interface ExamPaper {
  id: string;
  title: string;
  course: string;
  durationMinutes: number;
  totalScore: number;
  sections: ExamSection[];
  questions: ExamQuestion[];
  warnings: string[];
  generatedAt: string;
  model: string;
}

export interface ExamAttempt {
  paperId: string;
  course: string;
  title: string;
  submittedAt: string;
  durationSeconds: number;
  maxScore: number;
  objectiveScore: number;
  selfScore: number;
  answers: Record<string, string>;
  rubricChecks: Record<string, number[]>;
  wrongQuestionIds: string[];
}

export interface ExamProfileSection {
  id: string;
  title: string;
  questionType: QuestionType;
  questionCount: number;
  pointsPerQuestion: number | null;
  sectionScore: number;
  scoringGroups: ScoringGroup[];
}

export interface ExamProfile {
  course: string;
  totalScore: number;
  durationMinutes: number | null;
  sections: ExamProfileSection[];
  difficultyDistribution: {
    basic?: number;
    integrated?: number;
    advanced?: number;
  } | null;
  topicCoverage: string[];
  commonPatterns: string[];
  uncertainties: string[];
}
