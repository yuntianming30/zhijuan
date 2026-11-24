from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def validate_profile(profile: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(profile, dict):
        return ["命题画像根节点必须是对象"]

    total_score = profile.get("totalScore")
    if not isinstance(total_score, (int, float)) or total_score <= 0:
        errors.append("totalScore 必须为正数")
        total_score = 0

    sections = profile.get("sections")
    if not isinstance(sections, list) or not sections:
        return errors + ["sections 必须是非空数组"]

    computed_total = 0
    for index, section in enumerate(sections):
        prefix = f"sections[{index}]"
        if not isinstance(section, dict):
            errors.append(f"{prefix}: 必须是对象")
            continue

        count = section.get("questionCount")
        score = section.get("sectionScore")
        if not all(isinstance(value, (int, float)) and value > 0 for value in (count, score)):
            errors.append(f"{prefix}: 题量和分区总分必须为正数")
            continue

        scoring_groups = section.get("scoringGroups")
        if scoring_groups:
            group_question_count = 0
            group_score = 0
            for group_index, group in enumerate(scoring_groups):
                group_prefix = f"{prefix}.scoringGroups[{group_index}]"
                group_count = group.get("questionCount") if isinstance(group, dict) else None
                group_points = (
                    group.get("pointsPerQuestion") if isinstance(group, dict) else None
                )
                score_value = group.get("groupScore") if isinstance(group, dict) else None
                if not all(
                    isinstance(value, (int, float)) and value > 0
                    for value in (group_count, group_points, score_value)
                ):
                    errors.append(
                        f"{group_prefix}: 题量、单题分值和组总分必须为正数"
                    )
                    continue
                if group_count * group_points != score_value:
                    errors.append(
                        f"{group_prefix}: 题量 × 单题分值 != 组总分"
                    )
                group_question_count += group_count
                group_score += score_value

            if group_question_count != count:
                errors.append(
                    f"{prefix}: 评分组题量之和 {group_question_count} != 分区题量 {count}"
                )
            if group_score != score:
                errors.append(
                    f"{prefix}: 评分组总分 {group_score} != 分区总分 {score}"
                )
        else:
            points = section.get("pointsPerQuestion")
            if not isinstance(points, (int, float)) or points <= 0:
                errors.append(f"{prefix}: 缺少 pointsPerQuestion 或 scoringGroups")
                continue
            if count * points != score:
                errors.append(f"{prefix}: 题量 × 单题分值 != 分区总分")
        computed_total += score

    if computed_total != total_score:
        errors.append(f"分区总分 {computed_total} != 试卷总分 {total_score}")

    if profile.get("durationMinutes") is None:
        uncertainties = " ".join(profile.get("uncertainties", []))
        if "考试时长" not in uncertainties:
            errors.append("考试时长未知时必须在 uncertainties 中说明")

    if profile.get("difficultyDistribution") is None:
        uncertainties = " ".join(profile.get("uncertainties", []))
        if "难度" not in uncertainties:
            errors.append("难度分布未知时必须在 uncertainties 中说明")

    if not profile.get("topicCoverage"):
        errors.append("topicCoverage 不能为空")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a golden exam profile.")
    parser.add_argument("profile")
    args = parser.parse_args()

    path = Path(args.profile)
    profile = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_profile(profile)

    if errors:
        print(f"FAILED: {len(errors)} profile error(s)")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"PASSED: {profile.get('course')} has "
        f"{len(profile.get('sections', []))} section(s) and "
        f"{profile.get('totalScore')} total points"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
