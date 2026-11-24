from __future__ import annotations

import copy
import unittest

from validation.validate_exam_profile import validate_profile


class ExamProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = {
            "course": "test",
            "totalScore": 20,
            "durationMinutes": None,
            "difficultyDistribution": None,
            "topicCoverage": ["topic"],
            "uncertainties": ["考试时长未知", "难度分布未知"],
            "sections": [
                {
                    "title": "计算题",
                    "questionType": "calculation",
                    "questionCount": 2,
                    "sectionScore": 20,
                    "scoringGroups": [
                        {
                            "questionCount": 1,
                            "pointsPerQuestion": 12,
                            "groupScore": 12,
                        },
                        {
                            "questionCount": 1,
                            "pointsPerQuestion": 8,
                            "groupScore": 8,
                        },
                    ],
                }
            ],
        }

    def test_accepts_variable_subquestion_scores(self) -> None:
        self.assertEqual(validate_profile(self.profile), [])

    def test_rejects_group_total_mismatch(self) -> None:
        profile = copy.deepcopy(self.profile)
        profile["sections"][0]["scoringGroups"][0]["groupScore"] = 11
        errors = validate_profile(profile)
        self.assertTrue(any("组总分" in error for error in errors))

    def test_rejects_missing_uncertainty_when_duration_unknown(self) -> None:
        profile = copy.deepcopy(self.profile)
        profile["uncertainties"] = ["难度分布未知"]
        errors = validate_profile(profile)
        self.assertTrue(any("考试时长未知" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
