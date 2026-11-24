from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ALLOWED_QUESTION_TYPES = {
    "single_choice",
    "multiple_choice",
    "true_false",
    "fill_blank",
    "short_answer",
    "calculation",
    "proof",
    "experiment",
    "code_reading",
    "code_completion",
    "code_design",
}

ALLOWED_VERIFICATION_STATUS = {"sourced", "supplemented", "uncertain"}
ALLOWED_GRADING_MODES = {"auto", "rubricSelf", "manual"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _duplicates(values: list[str]) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def _validate_evidence(
    evidence: Any,
    known_documents: set[str],
    known_blocks: set[str],
    location: str,
    errors: list[str],
) -> None:
    if not isinstance(evidence, list):
        errors.append(f"{location}: evidence 必须是数组")
        return

    for index, item in enumerate(evidence):
        item_location = f"{location}.evidence[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_location}: 必须是对象")
            continue

        document_id = item.get("documentId")
        block_id = item.get("blockId")

        if document_id not in known_documents:
            errors.append(f"{item_location}: 引用了不存在的文件 {document_id!r}")
        if block_id not in known_blocks:
            errors.append(f"{item_location}: 引用了不存在的片段 {block_id!r}")


def validate_payload(payload: Any) -> list[str]:
    errors: list[str] = []

    if not isinstance(payload, dict):
        return ["根节点必须是对象"]
    if payload.get("schemaVersion") != "0.1":
        errors.append("schemaVersion 必须为 0.1")

    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        return errors + ["scenarios 必须是非空数组"]

    for scenario_index, scenario in enumerate(scenarios):
        prefix = f"scenarios[{scenario_index}]"
        if not isinstance(scenario, dict):
            errors.append(f"{prefix}: 必须是对象")
            continue

        course = scenario.get("course", {})
        course_id = course.get("id") if isinstance(course, dict) else None
        if not course_id:
            errors.append(f"{prefix}.course: 缺少 id")
            continue

        sources = scenario.get("sources", [])
        if not isinstance(sources, list):
            errors.append(f"{prefix}.sources: 必须是数组")
            sources = []

        known_documents = {
            source.get("id")
            for source in sources
            if isinstance(source, dict) and source.get("id")
        }
        known_blocks: set[str] = set()
        for source in sources:
            if not isinstance(source, dict):
                continue
            for block in source.get("blocks", []):
                if isinstance(block, dict) and block.get("id"):
                    known_blocks.add(block["id"])

        graph = scenario.get("graph", {})
        if not isinstance(graph, dict):
            errors.append(f"{prefix}.graph: 必须是对象")
            graph = {}
        if graph.get("courseId") != course_id:
            errors.append(f"{prefix}.graph: courseId 与课程不一致")

        nodes = graph.get("nodes", [])
        if not isinstance(nodes, list) or not nodes:
            errors.append(f"{prefix}.graph.nodes: 必须是非空数组")
            nodes = []

        node_ids = [
            node.get("id")
            for node in nodes
            if isinstance(node, dict) and node.get("id")
        ]
        for duplicate in _duplicates(node_ids):
            errors.append(f"{prefix}.graph: 知识点 id 重复 {duplicate!r}")

        for node_index, node in enumerate(nodes):
            node_location = f"{prefix}.graph.nodes[{node_index}]"
            if not isinstance(node, dict):
                errors.append(f"{node_location}: 必须是对象")
                continue
            if not node.get("id") or not node.get("title"):
                errors.append(f"{node_location}: 缺少 id 或 title")
            status = node.get("verificationStatus")
            if status not in ALLOWED_VERIFICATION_STATUS:
                errors.append(f"{node_location}: verificationStatus 无效")
            evidence = node.get("evidence")
            _validate_evidence(
                evidence,
                known_documents,
                known_blocks,
                node_location,
                errors,
            )
            if status == "sourced" and not evidence:
                errors.append(f"{node_location}: sourced 节点必须有来源")

        blueprint = scenario.get("blueprint", {})
        if not isinstance(blueprint, dict):
            errors.append(f"{prefix}.blueprint: 必须是对象")
            blueprint = {}
        if blueprint.get("courseId") != course_id:
            errors.append(f"{prefix}.blueprint: courseId 与课程不一致")

        total_score = blueprint.get("totalScore")
        if not _is_number(total_score) or total_score <= 0:
            errors.append(f"{prefix}.blueprint: totalScore 必须为正数")
            total_score = 0

        difficulty = blueprint.get("difficultyRatio", {})
        if not isinstance(difficulty, dict) or sum(
            value for value in difficulty.values() if _is_number(value)
        ) != 100:
            errors.append(f"{prefix}.blueprint: 难度比例之和必须为 100")

        sections = blueprint.get("sections", [])
        if not isinstance(sections, list) or not sections:
            errors.append(f"{prefix}.blueprint.sections: 必须是非空数组")
            sections = []

        section_ids = [
            section.get("id")
            for section in sections
            if isinstance(section, dict) and section.get("id")
        ]
        for duplicate in _duplicates(section_ids):
            errors.append(f"{prefix}.blueprint: 分区 id 重复 {duplicate!r}")

        section_scores = 0
        for section_index, section in enumerate(sections):
            section_location = f"{prefix}.blueprint.sections[{section_index}]"
            if not isinstance(section, dict):
                errors.append(f"{section_location}: 必须是对象")
                continue
            question_type = section.get("questionType")
            if question_type not in ALLOWED_QUESTION_TYPES:
                errors.append(f"{section_location}: questionType 无效")
            count = section.get("questionCount")
            score = section.get("sectionScore")
            if not all(_is_number(value) and value > 0 for value in (count, score)):
                errors.append(f"{section_location}: 题量和分区总分必须为正数")
                continue

            scoring_groups = section.get("scoringGroups")
            if scoring_groups:
                group_question_count = 0
                group_score = 0
                for group_index, group in enumerate(scoring_groups):
                    group_location = f"{section_location}.scoringGroups[{group_index}]"
                    if not isinstance(group, dict):
                        errors.append(f"{group_location}: 必须是对象")
                        continue
                    group_count = group.get("questionCount")
                    group_points = group.get("pointsPerQuestion")
                    score_value = group.get("groupScore")
                    if not all(
                        _is_number(value) and value > 0
                        for value in (group_count, group_points, score_value)
                    ):
                        errors.append(
                            f"{group_location}: 题量、单题分值和组总分必须为正数"
                        )
                        continue
                    if group_count * group_points != score_value:
                        errors.append(
                            f"{group_location}: 题量 × 单题分值 != 组总分"
                        )
                    group_question_count += group_count
                    group_score += score_value
                if group_question_count != count:
                    errors.append(
                        f"{section_location}: 评分组题量之和 != 分区题量"
                    )
                if group_score != score:
                    errors.append(
                        f"{section_location}: 评分组总分 != 分区总分"
                    )
            else:
                points = section.get("pointsPerQuestion")
                if not _is_number(points) or points <= 0:
                    errors.append(
                        f"{section_location}: 缺少 pointsPerQuestion 或 scoringGroups"
                    )
                    continue
                if count * points != score:
                    errors.append(f"{section_location}: 题量 × 单题分值 != 分区总分")
            section_scores += score

        if section_scores != total_score:
            errors.append(
                f"{prefix}.blueprint: 分区总分 {section_scores} != 试卷总分 {total_score}"
            )

        paper = scenario.get("paper", {})
        if not isinstance(paper, dict):
            errors.append(f"{prefix}.paper: 必须是对象")
            paper = {}
        if paper.get("courseId") != course_id:
            errors.append(f"{prefix}.paper: courseId 与课程不一致")
        if paper.get("blueprintId") != blueprint.get("id"):
            errors.append(f"{prefix}.paper: blueprintId 与蓝图不一致")

        questions = paper.get("questions", [])
        if not isinstance(questions, list) or not questions:
            errors.append(f"{prefix}.paper.questions: 必须是非空数组")
            questions = []

        question_ids = [
            question.get("id")
            for question in questions
            if isinstance(question, dict) and question.get("id")
        ]
        for duplicate in _duplicates(question_ids):
            errors.append(f"{prefix}.paper: 题目 id 重复 {duplicate!r}")

        section_map = {
            section.get("id"): section
            for section in sections
            if isinstance(section, dict) and section.get("id")
        }
        per_section_counts: dict[str, int] = {}
        paper_score = 0

        for question_index, question in enumerate(questions):
            question_location = f"{prefix}.paper.questions[{question_index}]"
            if not isinstance(question, dict):
                errors.append(f"{question_location}: 必须是对象")
                continue

            question_type = question.get("questionType")
            if question_type not in ALLOWED_QUESTION_TYPES:
                errors.append(f"{question_location}: questionType 无效")

            section_id = question.get("sectionId")
            section = section_map.get(section_id)
            if section is None:
                errors.append(f"{question_location}: sectionId 不存在")
            else:
                per_section_counts[section_id] = per_section_counts.get(section_id, 0) + 1
                if question_type != section.get("questionType"):
                    errors.append(f"{question_location}: 题型与分区不一致")
                if question.get("points") != section.get("pointsPerQuestion"):
                    errors.append(f"{question_location}: 分值与分区不一致")

            points = question.get("points")
            if not _is_number(points) or points <= 0:
                errors.append(f"{question_location}: 分值必须为正数")
            else:
                paper_score += points

            knowledge_node_ids = question.get("knowledgeNodeIds", [])
            if not isinstance(knowledge_node_ids, list) or not knowledge_node_ids:
                errors.append(f"{question_location}: 至少关联一个知识点")
            else:
                for node_id in knowledge_node_ids:
                    if node_id not in node_ids:
                        errors.append(f"{question_location}: 知识点不存在 {node_id!r}")

            _validate_evidence(
                question.get("evidence"),
                known_documents,
                known_blocks,
                question_location,
                errors,
            )

            grading_mode = question.get("gradingMode")
            if grading_mode not in ALLOWED_GRADING_MODES:
                errors.append(f"{question_location}: gradingMode 无效")
            if grading_mode == "auto" and not question.get("answer"):
                errors.append(f"{question_location}: 自动判分题必须有答案")
            if grading_mode == "rubricSelf" and not question.get("rubric"):
                errors.append(f"{question_location}: 自评题必须提供评分点")

        if paper_score != total_score:
            errors.append(f"{prefix}.paper: 题目总分 {paper_score} != 试卷总分 {total_score}")

        for section in sections:
            if not isinstance(section, dict):
                continue
            section_id = section.get("id")
            expected_count = section.get("questionCount")
            actual_count = per_section_counts.get(section_id, 0)
            if expected_count != actual_count:
                errors.append(
                    f"{prefix}.paper: 分区 {section_id!r} 应有 {expected_count} 题，"
                    f"实际 {actual_count} 题"
                )

    return errors


def load_fixture(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate synthetic STEM contract fixtures.")
    parser.add_argument(
        "fixture",
        nargs="?",
        default=str(
            Path(__file__).parent / "fixtures" / "contract-scenarios.json"
        ),
    )
    args = parser.parse_args()

    fixture_path = Path(args.fixture)
    payload = load_fixture(fixture_path)
    errors = validate_payload(payload)

    if errors:
        print(f"FAILED: {len(errors)} contract error(s)")
        for error in errors:
            print(f"- {error}")
        return 1

    scenarios = payload.get("scenarios", [])
    print(f"PASSED: {len(scenarios)} scenario(s) satisfy the contract")
    for scenario in scenarios:
        course_name = scenario.get("course", {}).get("name", "unknown")
        paper = scenario.get("paper", {})
        print(f"- {course_name}: {len(paper.get('questions', []))} questions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
