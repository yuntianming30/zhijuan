import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const generatedDir = resolve("local-samples/generated");
const files = (await readdir(generatedDir)).sort().reverse();
let graph;
for (const file of files.filter((name) => name.endsWith("-knowledge.json"))) {
  const payload = JSON.parse(await readFile(join(generatedDir, file), "utf8"));
  if (payload.graph?.course === "线性代数") {
    graph = payload.graph;
    break;
  }
}
if (!graph) throw new Error("No linear algebra knowledge graph found.");

const profileFile = files.find((name) => name.endsWith("-exam-profile.json"));
if (!profileFile) throw new Error("No exam profile found.");
const profile = JSON.parse(
  await readFile(join(generatedDir, profileFile), "utf8"),
).profile;

const sections = profile.sections.map((section, index) => {
  const hasVariableGroups =
    section.scoringGroups.length > 1 ||
    (section.scoringGroups.length === 1 &&
      section.scoringGroups[0].questionCount !== section.questionCount);
  return {
    id: `profile-section-${index + 1}`,
    title: section.title,
    questionType: section.questionType,
    questionCount: section.questionCount,
    pointsPerQuestion: hasVariableGroups
      ? undefined
      : section.pointsPerQuestion ??
        section.scoringGroups[0]?.pointsPerQuestion,
    sectionScore: section.sectionScore,
    scoringGroups: hasVariableGroups ? section.scoringGroups : undefined,
  };
});

const response = await fetch("http://127.0.0.1:8010/api/exam/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    course: "线性代数",
    language: "不适用",
    framework: "无",
    focus: "优先矩阵、向量组、线性方程组和特征值，不照搬原题。",
    blueprint: {
      title: "线性代数真题结构模拟卷",
      totalScore: profile.totalScore,
      durationMinutes: profile.durationMinutes ?? 120,
      sections,
      difficultyRatio: { basic: 60, integrated: 30, advanced: 10 },
    },
    knowledge: { summary: graph.summary, nodes: graph.nodes },
  }),
  signal: AbortSignal.timeout(480_000),
});
const payload = await response.json();
if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    `Generated ${payload.paper.questions.length} questions, ` +
      `${payload.paper.totalScore} points.`,
  );
}
